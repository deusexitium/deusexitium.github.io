const advisorState = {
  data: null,
  courseLookup: new Map(),
  categoryLookup: new Map(),
  exclusiveGroupLookup: new Map(),
  completed: new Set(),
  exclusiveLocks: new Map(),
  courseElements: new Map(),
  selectedCourse: null,
  eligibleCourses: new Set()
};

const advisorSelectors = {
  appRoot: () => document.getElementById('advisor-app'),
  courseSelection: () => document.getElementById('course-selection'),
  availabilityPanel: () => document.getElementById('availability-panel'),
  eligibleList: () => document.getElementById('eligible-list'),
  eligibleCount: () => document.getElementById('eligible-count'),
  completedCount: () => document.getElementById('completed-count'),
  completedCredits: () => document.getElementById('completed-credits'),
  courseFilter: () => document.getElementById('course-filter'),
  exclusiveStatus: () => document.getElementById('exclusive-status'),
  courseDetailPanel: () => document.getElementById('course-detail-panel')
};

const initAdvisor = async () => {
  const container = advisorSelectors.appRoot();

  if (!container) {
    console.error('Advisor container not found');
    return;
  }

  container.innerHTML = `<div class="advisor-loading">Loading program data…</div>`;

  try {
    const response = await fetch('program_data.json');

    if (!response.ok) {
      throw new Error(`Unable to load program data (status ${response.status})`);
    }

    const data = await response.json();
    configureState(data);
    renderAdvisorApp();
  } catch (error) {
    console.error('Failed to initialize advisor', error);
    container.innerHTML = `
      <div class="advisor-error">
        <h2>Unable to load advising data</h2>
        <p>${error.message}</p>
      </div>
    `;
  }
};

document.addEventListener('DOMContentLoaded', initAdvisor);

function configureState(data) {
  advisorState.data = data;
  advisorState.courseLookup = new Map(data.courses.map((course) => [course.code, course]));
  advisorState.categoryLookup = new Map(data.categories.map((cat) => [cat.id, cat]));
  advisorState.exclusiveGroupLookup = new Map(
    (data.exclusiveGroups || []).map((group) => [group.id, group])
  );
}

function renderAdvisorApp() {
  const container = advisorSelectors.appRoot();
  const { program, exclusiveGroups = [] } = advisorState.data;

  container.innerHTML = `
    <div class="advisor-shell">
      <section class="program-summary" aria-labelledby="program-title">
        <div class="program-summary__header">
          <h2 id="program-title">${program.name}</h2>
          <p>${program.description}</p>
        </div>
        <dl class="program-summary__stats">
          <div>
            <dt>Catalog Year</dt>
            <dd>${program.catalogYear}</dd>
          </div>
          <div>
            <dt>Total Credits</dt>
            <dd>${program.totalCredits}</dd>
          </div>
          <div>
            <dt>Completed Courses</dt>
            <dd id="completed-count">0</dd>
          </div>
          <div>
            <dt>Completed Credits</dt>
            <dd id="completed-credits">0</dd>
          </div>
          <div>
            <dt>Eligible Courses</dt>
            <dd id="eligible-count">0</dd>
          </div>
        </dl>
        ${exclusiveGroups.length
          ? `
            <section class="exclusive-groups" aria-label="Course selection rules">
              <h3>Mutually Exclusive Course Choices</h3>
              <ul>
                ${exclusiveGroups
                  .map(
                    (group) => `
                      <li>
                        <strong>${group.title}:</strong> ${group.description}
                      </li>
                    `
                  )
                  .join('')}
              </ul>
            </section>`
          : ''}
      </section>

      <section class="advisor-grid">
        <section class="course-selection" id="course-selection" aria-label="Completed course selection"></section>
        <section class="availability-panel" id="availability-panel" aria-live="polite">
          <div class="availability-panel__header">
            <h2>Courses You Can Take Next</h2>
            <p>Select completed classes to update recommendations.</p>
          </div>
          <div id="eligible-list" class="eligibility-list" role="list">
            <div class="eligibility-empty">Mark the classes you have completed to see what comes next.</div>
          </div>
          <div id="exclusive-status" class="exclusive-status" aria-live="polite"></div>
        </section>
        <aside class="course-detail" aria-live="polite">
          <div class="course-detail__inner" id="course-detail-panel">
            <h2>Course Details</h2>
            <p>Select a course to view prerequisites, notes, and recommendations.</p>
          </div>
        </aside>
      </section>
    </div>
  `;

  renderCourseSelection();
  recomputeEligibility();
  updateExclusiveStatus();
}

function renderCourseSelection() {
  const selectionRoot = advisorSelectors.courseSelection();
  const categoryCourses = groupCoursesByCategory();

  selectionRoot.innerHTML = `
    <header class="course-selection__header">
      <h2>Mark Completed Courses</h2>
      <p>Check the courses you have already finished to unlock new course recommendations.</p>
      <div class="course-selection__actions">
        <label class="course-filter">
          <span class="course-filter__label">Filter courses</span>
          <input type="search" id="course-filter" placeholder="Search by code or title" aria-label="Filter courses by code or title">
        </label>
        <button type="button" class="link-button" id="reset-selections">Reset selections</button>
      </div>
    </header>
    <div class="course-category-container"></div>
  `;

  const categoryContainer = selectionRoot.querySelector('.course-category-container');
  advisorState.courseElements.clear();

  categoryCourses.forEach(({ category, courses }) => {
    const categoryElement = document.createElement('section');
    categoryElement.className = 'course-category';
    categoryElement.innerHTML = `
      <details open>
        <summary>
          <div>
            <h3>${category.name}</h3>
            <p>${category.description || ''}</p>
          </div>
          <span class="category-count">${courses.length} course${courses.length === 1 ? '' : 's'}</span>
        </summary>
        <div class="course-card-collection"></div>
      </details>
    `;

    const collection = categoryElement.querySelector('.course-card-collection');

    courses
      .sort((a, b) => a.code.localeCompare(b.code))
      .forEach((course) => {
        const card = buildCourseCard(course);
        collection.appendChild(card);
      });

    categoryContainer.appendChild(categoryElement);
  });

  bindCourseSelectionEvents();
}

function groupCoursesByCategory() {
  const { categories, courses } = advisorState.data;
  const categoryMap = new Map();

  categories.forEach((category) => {
    categoryMap.set(category.id, { category, courses: [] });
  });

  courses.forEach((course) => {
    const group = categoryMap.get(course.category);
    if (group) {
      group.courses.push(course);
    }
  });

  return Array.from(categoryMap.values()).filter((entry) => entry.courses.length > 0);
}

function buildCourseCard(course) {
  const card = document.createElement('article');
  card.className = 'course-card';
  card.dataset.courseCode = course.code;
  card.dataset.searchTarget = `${course.code} ${course.title}`.toLowerCase();
  card.dataset.category = course.category;

  const exclusiveGroup = course.exclusiveGroup
    ? advisorState.exclusiveGroupLookup.get(course.exclusiveGroup)
    : null;

  const prereqSummary = formatPrerequisiteSummary(course.prerequisites);
  const notesList = (course.notes || []).map((note) => `<li>${note}</li>`).join('');

  card.innerHTML = `
    <header class="course-card__header">
      <div class="course-card__title">
        <h4>${course.code}</h4>
        <p>${course.title}</p>
      </div>
      <div class="course-card__meta">
        <span class="credit-badge" aria-label="${course.credits} credit${course.credits === 1 ? '' : 's'}">${course.credits} cr</span>
        ${exclusiveGroup ? `<span class="exclusive-badge" title="Choose only one course from this set">Exclusive choice</span>` : ''}
        <label class="course-card__checkbox">
          <input type="checkbox" data-course="${course.code}" ${course.exclusiveGroup ? `data-exclusive-group="${course.exclusiveGroup}"` : ''}>
          <span>Completed</span>
        </label>
      </div>
    </header>
    <div class="course-card__body">
      <div class="course-card__info">
        <div class="course-card__subinfo">
          <span class="course-subcategory">${course.subcategory || ''}</span>
        </div>
        <p class="course-card__prereq"><strong>Prerequisites:</strong> ${prereqSummary}</p>
      </div>
      <div class="course-card__actions">
        <button type="button" class="details-button" data-details="${course.code}">View details</button>
      </div>
    </div>
    ${notesList
      ? `<footer class="course-card__notes">
          <h5>Highlights</h5>
          <ul>${notesList}</ul>
        </footer>`
      : ''}
  `;

  const checkbox = card.querySelector('input[type="checkbox"]');
  const detailsButton = card.querySelector('[data-details]');

  checkbox.addEventListener('change', (event) => handleCourseToggle(course, event.target.checked));
  detailsButton.addEventListener('click', () => showCourseDetails(course.code));

  advisorState.courseElements.set(course.code, {
    card,
    checkbox,
    detailsButton
  });

  return card;
}

function bindCourseSelectionEvents() {
  const filterInput = advisorSelectors.courseFilter();
  const resetButton = document.getElementById('reset-selections');

  if (filterInput) {
    filterInput.addEventListener('input', (event) => applyCourseFilter(event.target.value));
  }

  if (resetButton) {
    resetButton.addEventListener('click', resetSelections);
  }
}

function applyCourseFilter(query) {
  const normalized = query.trim().toLowerCase();

  advisorState.courseElements.forEach(({ card }) => {
    const matches = !normalized || card.dataset.searchTarget.includes(normalized);
    card.classList.toggle('course-card--hidden', !matches);
  });
}

function resetSelections() {
  advisorState.completed.clear();
  advisorState.exclusiveLocks.clear();
  advisorState.courseElements.forEach(({ checkbox }) => {
    checkbox.checked = false;
    checkbox.disabled = false;
  });
  updateAllCourseCardStates();
  recomputeEligibility();
  updateExclusiveStatus();
  updateStats();
}

function handleCourseToggle(course, isCompleted) {
  if (isCompleted) {
    advisorState.completed.add(course.code);
    if (course.exclusiveGroup) {
      lockExclusiveGroup(course.exclusiveGroup, course.code);
    }
  } else {
    advisorState.completed.delete(course.code);
    if (course.exclusiveGroup) {
      unlockExclusiveGroup(course.exclusiveGroup, course.code);
    }
  }

  updateCourseCardState(course.code);
  recomputeEligibility();
  updateExclusiveStatus();
  updateStats();
}

function lockExclusiveGroup(groupId, courseCode) {
  advisorState.exclusiveLocks.set(groupId, courseCode);
  const selector = `input[data-exclusive-group="${groupId}"]`;
  document.querySelectorAll(selector).forEach((input) => {
    if (input.dataset.course !== courseCode) {
      input.checked = false;
      input.disabled = true;
      advisorState.completed.delete(input.dataset.course);
      updateCourseCardState(input.dataset.course);
    }
  });
}

function unlockExclusiveGroup(groupId, courseCode) {
  if (advisorState.exclusiveLocks.get(groupId) !== courseCode) {
    return;
  }

  advisorState.exclusiveLocks.delete(groupId);
  const selector = `input[data-exclusive-group="${groupId}"]`;
  document.querySelectorAll(selector).forEach((input) => {
    input.disabled = false;
    updateCourseCardState(input.dataset.course);
  });
}

function recomputeEligibility() {
  const eligibleCourses = advisorState.data.courses.filter((course) => {
    if (advisorState.completed.has(course.code)) {
      return false;
    }

    if (isCourseLockedByExclusive(course)) {
      return false;
    }

    return prerequisitesSatisfied(course.prerequisites || []);
  });

  advisorState.eligibleCourses = new Set(eligibleCourses.map((course) => course.code));
  renderEligibleCourses(eligibleCourses);
  updateAllCourseCardStates();
}

function prerequisitesSatisfied(prerequisites) {
  if (!prerequisites || prerequisites.length === 0) {
    return true;
  }

  return prerequisites.every((requirement) => {
    const requiredCourses = requirement.courses || [];

    if (requirement.type === 'all') {
      return requiredCourses.every((code) => advisorState.completed.has(code));
    }

    if (requirement.type === 'any') {
      return requiredCourses.some((code) => advisorState.completed.has(code));
    }

    return false;
  });
}

function isCourseLockedByExclusive(course) {
  const { exclusiveGroup } = course;
  if (!exclusiveGroup) {
    return false;
  }

  const lockedCode = advisorState.exclusiveLocks.get(exclusiveGroup);
  return lockedCode && lockedCode !== course.code;
}

function renderEligibleCourses(eligibleCourses) {
  const eligibleList = advisorSelectors.eligibleList();

  if (!eligibleCourses.length) {
    eligibleList.innerHTML = `
      <div class="eligibility-empty">
        No eligible courses yet. Mark previously completed courses to unlock recommendations.
      </div>
    `;
    advisorSelectors.eligibleCount().textContent = '0';
    return;
  }

  eligibleList.innerHTML = eligibleCourses
    .sort((a, b) => a.code.localeCompare(b.code))
    .map(
      (course) => `
        <article class="eligible-card" role="listitem" data-course="${course.code}">
          <div class="eligible-card__info">
            <h3>${course.code}</h3>
            <p>${course.title}</p>
          </div>
          <div class="eligible-card__meta">
            <span class="credit-badge">${course.credits} cr</span>
            <button type="button" class="details-button details-button--ghost" data-eligible-details="${course.code}">Details</button>
          </div>
        </article>
      `
    )
    .join('');

  eligibleList.querySelectorAll('[data-eligible-details]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const courseCode = event.currentTarget.dataset.eligibleDetails;
      showCourseDetails(courseCode);
    });
  });

  advisorSelectors.eligibleCount().textContent = String(eligibleCourses.length);
}

function updateCourseCardState(courseCode) {
  const element = advisorState.courseElements.get(courseCode);
  const course = advisorState.courseLookup.get(courseCode);

  if (!element || !course) {
    return;
  }

  const { card, checkbox } = element;
  const isCompleted = advisorState.completed.has(courseCode);
  const isEligible = advisorState.eligibleCourses.has(courseCode);
  const locked = isCourseLockedByExclusive(course);

  card.classList.toggle('course-card--completed', isCompleted);
  card.classList.toggle('course-card--eligible', isEligible);
  card.classList.toggle('course-card--locked', locked);

  if (!checkbox.disabled) {
    checkbox.checked = isCompleted;
  }
}

function updateAllCourseCardStates() {
  advisorState.courseElements.forEach((_, courseCode) => updateCourseCardState(courseCode));
}

function updateStats() {
  let completedCredits = 0;

  advisorState.completed.forEach((courseCode) => {
    const course = advisorState.courseLookup.get(courseCode);
    if (course) {
      completedCredits += course.credits || 0;
    }
  });

  advisorSelectors.completedCount().textContent = String(advisorState.completed.size);
  advisorSelectors.completedCredits().textContent = String(completedCredits);
  advisorSelectors.eligibleCount().textContent = String(advisorState.eligibleCourses.size);
}

function updateExclusiveStatus() {
  const statusElement = advisorSelectors.exclusiveStatus();
  const entries = [];

  advisorState.exclusiveLocks.forEach((courseCode, groupId) => {
    const group = advisorState.exclusiveGroupLookup.get(groupId);
    const course = advisorState.courseLookup.get(courseCode);

    if (!group || !course) {
      return;
    }

    entries.push(`
      <li>
        <strong>${group.title}:</strong> Locked to <span>${course.code} – ${course.title}</span>
      </li>
    `);
  });

  statusElement.innerHTML = entries.length
    ? `<h3>Locked Course Choices</h3><ul>${entries.join('')}</ul>`
    : '';
}

function showCourseDetails(courseCode) {
  const panel = advisorSelectors.courseDetailPanel();
  const course = advisorState.courseLookup.get(courseCode);

  if (!course || !panel) {
    return;
  }

  advisorState.selectedCourse = courseCode;
  highlightSelectedCourse();

  const isCompleted = advisorState.completed.has(courseCode);
  const isEligible = advisorState.eligibleCourses.has(courseCode);
  const locked = isCourseLockedByExclusive(course);
  const exclusiveGroup = course.exclusiveGroup
    ? advisorState.exclusiveGroupLookup.get(course.exclusiveGroup)
    : null;

  const prerequisiteStatus = (course.prerequisites || []).map((requirement) => ({
    label: formatPrerequisiteRequirement(requirement),
    satisfied: evaluateRequirement(requirement)
  }));

  const notes = course.notes || [];

  panel.innerHTML = `
    <header class="course-detail__header">
      <div>
        <h2>${course.code}</h2>
        <p>${course.title}</p>
      </div>
      <span class="credit-badge">${course.credits} cr</span>
    </header>
    <section class="course-detail__status">
      <p class="status-pill ${isCompleted ? 'status-pill--success' : ''}">
        ${isCompleted ? 'Marked as completed' : 'Not yet completed'}
      </p>
      <p class="status-pill ${isEligible ? 'status-pill--info' : ''}">
        ${isEligible ? 'Eligible to take next' : 'Prerequisites not fully met'}
      </p>
      ${locked ? '<p class="status-pill status-pill--warning">Unavailable (exclusive choice taken)</p>' : ''}
    </section>
    <section class="course-detail__section">
      <h3>Category</h3>
      <p>${formatCategoryLabel(course)}</p>
    </section>
    <section class="course-detail__section">
      <h3>Prerequisite Requirements</h3>
      ${prerequisiteStatus.length
        ? `<ul class="prereq-status-list">
            ${prerequisiteStatus
              .map(
                (item) => `
                  <li class="prereq-status ${item.satisfied ? 'prereq-status--met' : 'prereq-status--not-met'}">
                    <span>${item.label}</span>
                    <span class="prereq-status__badge">${item.satisfied ? 'Met' : 'Not met'}</span>
                  </li>
                `
              )
              .join('')}
          </ul>`
        : '<p>No prerequisites.</p>'}
    </section>
    ${exclusiveGroup
      ? `<section class="course-detail__section">
          <h3>Exclusive Choice</h3>
          <p>${exclusiveGroup.description}</p>
        </section>`
      : ''}
    ${notes.length
      ? `<section class="course-detail__section">
          <h3>Advisor Notes</h3>
          <ul class="detail-note-list">
            ${notes.map((note) => `<li>${note}</li>`).join('')}
          </ul>
        </section>`
      : ''}
    ${course.info
      ? `<section class="course-detail__section">
          <h3>Additional Information</h3>
          <p>${course.info}</p>
        </section>`
      : ''}
  `;
}

function highlightSelectedCourse() {
  advisorState.courseElements.forEach(({ card }, code) => {
    card.classList.toggle('course-card--active', code === advisorState.selectedCourse);
  });
}

function formatCategoryLabel(course) {
  const category = advisorState.categoryLookup.get(course.category);
  if (!category) {
    return course.category;
  }

  const pieces = [category.name];
  if (course.subcategory) {
    pieces.push(course.subcategory);
  }

  return pieces.join(' • ');
}

function formatPrerequisiteSummary(prerequisites = []) {
  if (!prerequisites.length) {
    return 'None';
  }

  return prerequisites
    .map((requirement) => formatPrerequisiteRequirement(requirement))
    .join('; ');
}

function formatPrerequisiteRequirement(requirement) {
  const courseNames = requirement.courses
    .map((code) => {
      const course = advisorState.courseLookup.get(code);
      return course ? `${course.code}` : code;
    })
    .join(', ');

  if (requirement.type === 'all') {
    return `All of: ${courseNames}`;
  }

  if (requirement.type === 'any') {
    const detail = requirement.detail ? ` (${requirement.detail})` : '';
    return `Any of: ${courseNames}${detail}`;
  }

  return courseNames;
}

function evaluateRequirement(requirement) {
  const courses = requirement.courses || [];

  if (requirement.type === 'all') {
    return courses.every((code) => advisorState.completed.has(code));
  }

  if (requirement.type === 'any') {
    return courses.some((code) => advisorState.completed.has(code));
  }

  return false;
}

