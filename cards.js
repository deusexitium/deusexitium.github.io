// Card Game JavaScript Implementation for Assignment 8

class CardDeck {
    constructor() {
        this.cards = this.initializeDeck();
        this.dealtCards = new Set();
        this.shuffleDeck();
    }

    initializeDeck() {
        const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        const values = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];
        const cards = [];

        suits.forEach(suit => {
            values.forEach(value => {
                cards.push({
                    value: value,
                    suit: suit,
                    id: `${value}_of_${suit}`,
                    svgPath: `cards/${value}_of_${suit}.svg`
                });
            });
        });

        // Add jokers
        cards.push(
            { value: 'joker', suit: 'red', id: 'red_joker', svgPath: 'cards/red_joker.svg' },
            { value: 'joker', suit: 'black', id: 'black_joker', svgPath: 'cards/black_joker.svg' }
        );

        return cards;
    }

    shuffleDeck() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    dealCard() {
        if (this.cards.length === 0) return null;

        const card = this.cards.pop();
        this.dealtCards.add(card.id);
        return card;
    }

    getRemainingCards() {
        return this.cards.length;
    }

    resetDeck() {
        this.cards = this.initializeDeck();
        this.dealtCards.clear();
        this.shuffleDeck();
    }
}

class CardGame {
    constructor() {
        this.deck = new CardDeck();
        this.discardedCards = [];
        this.gameElements = {
            dealBtn: null,
            cardsRemaining: null,
            discardCount: null,
            playingField: null,
            discardPile: null,
            deckContainer: null
        };

        this.init();
    }

    init() {
        this.getDOMElements();
        this.bindEvents();
        this.updateGameStatus();
    }

    getDOMElements() {
        this.gameElements.dealBtn = document.getElementById('deal-btn');
        this.gameElements.cardsRemaining = document.getElementById('cards-remaining');
        this.gameElements.discardCount = document.getElementById('discard-count');
        this.gameElements.playingField = document.getElementById('playing-field');
        this.gameElements.discardPile = document.getElementById('discard-pile');
        this.gameElements.deckContainer = document.getElementById('deck-container');
    }

    bindEvents() {
        if (this.gameElements.dealBtn) {
            this.gameElements.dealBtn.addEventListener('click', () => this.dealCards());
        }
    }

    dealCards() {
        // Deal 5 cards to the playing field
        const numberOfCards = 5;

        for (let i = 0; i < numberOfCards; i++) {
            const card = this.deck.dealCard();
            if (card) {
                this.createCardElement(card, i);
            } else {
                console.log('No more cards in deck!');
                break;
            }
        }

        this.updateGameStatus();

        // Trigger custom event for card dealing
        const dealEvent = new CustomEvent('cardsDealt', {
            detail: { cardsDealt: numberOfCards }
        });
        document.dispatchEvent(dealEvent);
    }

    createCardElement(card, index) {
        const cardElement = document.createElement('div');
        cardElement.className = 'card dealing';
        cardElement.dataset.cardId = card.id;
        cardElement.draggable = true;

        // Create card content
        const cardInner = document.createElement('div');
        cardInner.className = 'card-inner';

        const cardFront = document.createElement('div');
        cardFront.className = 'card-front';

        const cardImage = document.createElement('img');
        cardImage.src = card.svgPath;
        cardImage.alt = `${card.value} of ${card.suit}`;
        cardImage.className = 'card-image';

        cardFront.appendChild(cardImage);
        cardInner.appendChild(cardFront);
        cardElement.appendChild(cardInner);

        // Add event listeners for drag and drop
        this.addCardEventListeners(cardElement);

        // Append to playing field with animation delay
        setTimeout(() => {
            if (this.gameElements.playingField) {
                this.gameElements.playingField.appendChild(cardElement);
            }
        }, index * 100);

        return cardElement;
    }

    addCardEventListeners(cardElement) {
        cardElement.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', cardElement.dataset.cardId);
            cardElement.classList.add('dragging');

            // Trigger custom drag start event
            const dragEvent = new CustomEvent('cardDragStart', {
                detail: { cardId: cardElement.dataset.cardId }
            });
            document.dispatchEvent(dragEvent);
        });

        cardElement.addEventListener('dragend', (e) => {
            cardElement.classList.remove('dragging');
        });
    }

    updateGameStatus() {
        if (this.gameElements.cardsRemaining) {
            this.gameElements.cardsRemaining.textContent = `${this.deck.getRemainingCards()} cards remaining`;
        }

        if (this.gameElements.discardCount) {
            this.gameElements.discardCount.textContent = `${this.discardedCards.length} cards discarded`;
        }

        // Update deck container appearance
        if (this.gameElements.deckContainer) {
            const cardBack = this.gameElements.deckContainer.querySelector('.card-back');
            if (cardBack) {
                cardBack.style.opacity = this.deck.getRemainingCards() === 0 ? '0.5' : '1';
            }
        }
    }

    discardCard(cardId) {
        const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);
        if (cardElement && this.gameElements.discardPile) {
            // Move card to discard pile
            this.gameElements.discardPile.appendChild(cardElement);
            cardElement.draggable = false; // Can't drag from discard pile

            // Track discarded card
            this.discardedCards.push(cardId);

            this.updateGameStatus();

            // Trigger custom discard event
            const discardEvent = new CustomEvent('cardDiscarded', {
                detail: { cardId: cardId }
            });
            document.dispatchEvent(discardEvent);
        }
    }

    resetGame() {
        // Clear playing field
        if (this.gameElements.playingField) {
            this.gameElements.playingField.innerHTML = '';
        }

        // Clear discard pile
        if (this.gameElements.discardPile) {
            this.gameElements.discardPile.innerHTML = '';
        }

        // Reset deck
        this.deck.resetDeck();
        this.discardedCards = [];

        this.updateGameStatus();
    }
}

// Drag and Drop Manager
class DragDropManager {
    constructor(cardGame) {
        this.cardGame = cardGame;
        this.initEventListeners();
    }

    initEventListeners() {
        // Drop zone events
        document.addEventListener('dragover', (e) => this.handleDragOver(e));
        document.addEventListener('drop', (e) => this.handleDrop(e));
        document.addEventListener('dragleave', (e) => this.handleDragLeave(e));
    }

    handleDragOver(e) {
        e.preventDefault();
        const dropZone = e.target.closest('.discard-area');
        if (dropZone) {
            dropZone.classList.add('drag-over');
        }
    }

    handleDragLeave(e) {
        const dropZone = e.target.closest('.discard-area');
        if (dropZone) {
            dropZone.classList.remove('drag-over');
        }
    }

    handleDrop(e) {
        e.preventDefault();
        const dropZone = e.target.closest('.discard-area');
        if (dropZone) {
            dropZone.classList.remove('drag-over');
            const cardId = e.dataTransfer.getData('text/plain');
            if (cardId) {
                this.cardGame.discardCard(cardId);
            }
        }
    }
}

// Initialize the game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const cardGame = new CardGame();
    const dragDropManager = new DragDropManager(cardGame);

    // Make cardGame globally accessible for debugging
    window.cardGame = cardGame;
    window.dragDropManager = dragDropManager;

    console.log('Card Game initialized successfully!');
    console.log('Available cards in deck:', cardGame.deck.getRemainingCards());
});