import jwt from 'jsonwebtoken';

const SUITS = ['♥', '♦', '♣', '♠'];
const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const SECRET = "supersecret";

export class betTimer {
    betInterval = undefined;
    intervalCounter = 0;

    newHandInterval = undefined;
    newHandIntervalCounter = 0;

    showDownInterval = undefined;
    showDownIntervalCounter = 0;

    constructor() {
        
    }
    /**
     * relativeHandStrength(heroHand, board, numPlayers)
     * Palauttaa arvion käden vahvuudesta 0–1 välillä
     */
    relativeHandStrength(heroHand, board, players) {
        const eq = this.simulateEquity(heroHand, board, players);
        return Math.min(1, eq.win * players);
    }

    remainingDeckSize(board, heroHand) {
        // Varmistetaan, että board on taulukko
        board = Array.isArray(board) ? board : [];
        heroHand = Array.isArray(heroHand) ? heroHand : [];
        const fullDeck = RANKS.flatMap(r => SUITS.map(s => r+s));
        const usedCards = [...heroHand, ...board];
        const remaining = fullDeck.filter(c => !usedCards.includes(c));
        return remaining.length;
    }
     
    createDeck(shuffle = true) {
        const deck = [];

        for (const r of RANKS) {
            for (const s of SUITS) {
                deck.push(r + s);
            }
        }

        if (shuffle) this.shuffleDeck(deck);
        return deck;
    }

    shuffleDeck(deck) {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
    }

    shuffle(deck) {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    analyzeBoard(board) {
        // Tarkastellaan boardin kortteja ja palautetaan boardin tyyppi
        // board: array, esim ["Ad","6d","7h","Tc","Js"]
        if(!board || board.length === 0) return { type: 'empty' };

        const suits = board.map(c => c[1]); // kortin maa
        const ranks = board.map(c => c[0]); // kortin arvo
        const uniqueSuits = new Set(suits);
        const uniqueRanks = new Set(ranks);

        let texture = 'dry'; // oletus
        if(uniqueSuits.size === 1) texture = 'flushDraw';
        else if(uniqueRanks.size <= board.length - 2) texture = 'paired';
        else if(this.isConnected(ranks)) texture = 'straightDraw';

        return {
            type: texture,
            suits: suits,
            ranks: ranks,
            uniqueSuits: uniqueSuits.size,
            uniqueRanks: uniqueRanks.size
        };
    }


    /**
     * estimateEV(heroHand, board, currentBet, pot, numPlayers)
     * Arvioi odotusarvon yksittäiselle toiminnalle
     */
    estimateEV(heroHand, board, currentBet, pot, numPlayers = 6) {
        if (!heroHand || heroHand.length !== 2) return 0;
        if (!board) board = [];

        // Käden vahvuus 0–1
        const handStrength = this.relativeHandStrength(heroHand, board, numPlayers);

        // Pot odds yksinkertaisesti
        const callAmount = currentBet;
        const potOdds = callAmount / (pot + callAmount);

        // Yksinkertainen EV-arvio: voittotodennäköisyys - panoksen suhde
        const ev = (handStrength - potOdds) * (pot + callAmount);

        return ev; // positiivinen = hyvä, negatiivinen = huono
    }

    analyzePlayerStats(player) {
        if (!player || !player.history || !player.history.length) {
            return {
                totalHands: 0,
                totalBets: 0,
                foldRate: 0,
                winRate: 0,
                aggression: 0
            };
        }

        const totalHands = player.history.length;
        const totalBets = player.history.reduce((sum, h) => sum + (h.bet || 0), 0);
        const totalFolds = player.history.filter(h => h.action === 'fold').length;
        const totalWins = player.history.filter(h => h.result === 'win').length;
        const totalRaises = player.history.filter(h => h.action === 'raise').length;
        const totalCalls = player.history.filter(h => h.action === 'call').length;

        return {
            totalHands,
            totalBets,
            foldRate: totalFolds / totalHands,
            winRate: totalWins / totalHands,
            aggression: (totalRaises + totalCalls) ? (totalRaises / (totalRaises + totalCalls)) : 0
        };
    }

    computeUltimateAnalysis(player, room) {
        if (!player || !room) return null;

        const heroHand = Array.isArray(player.hand) ? player.hand : [];
        const board = Array.isArray(room.board) ? room.board : [];
        const numPlayers = Object.keys(room.players || {}).length || 2;

        const equitySim = this.simulateEquity(heroHand, board, numPlayers);
        const equity = equitySim.win;
        const tie = equitySim.tie;
        const lose = equitySim.lose;

        const pot = room.pot || 0;
        const currentBet = room.currentBet || 0;
        const potOdds = currentBet > 0 ? currentBet / (pot + currentBet) : 0;

        const outs = this.countOuts(heroHand, board);
        const remaining = this.remainingDeckSize(heroHand, board);
        const outsPercent = remaining > 0 ? (outs / remaining) * 100 : 0;

        const boardTexture = this.analyzeBoard(board);
        const rhs = this.relativeHandStrength(heroHand, board, numPlayers);
        const ev = this.estimateEV(equity, potOdds, pot, currentBet, numPlayers);
        const stats = this.analyzePlayerStats(player);
        const decisionQuality = this.evaluateDecision(equity, potOdds);

        return {
            equity,
            tie,
            lose,
            potOdds,
            outsPercent,
            boardTexture,
            rhs,
            ev,
            stats,
            decisionQuality
        };
    }

    evaluateDecision(playerAction, heroHand, board, pot, currentBet, numPlayers) {
        // Lasketaan hero-käden equity
        const equity = this.simulateEquity(heroHand, board, numPlayers).win / 100;
        
        // Pot odds
        const potOdds = currentBet / (pot + currentBet);
        
        // Päätösvertailu
        let decisionQuality = 0; // 1 = hyvä, 0 = neutraali, -1 = huono

        if(playerAction === 'fold') {
            decisionQuality = (equity < potOdds) ? 1 : -1;
        } else if(playerAction === 'call') {
            decisionQuality = (equity >= potOdds) ? 1 : -1;
        } else if(playerAction === 'raise') {
            decisionQuality = (equity > potOdds) ? 1 : -1;
        }

        return {
            action: playerAction,
            equity,
            potOdds,
            decisionQuality
        };
    }

    isConnected(ranks) {
        const order = '23456789TJQKA';
        let values = ranks.map(r => order.indexOf(r)).sort((a,b)=>a-b);
        for(let i=0;i<values.length-1;i++){
            if(values[i+1] - values[i] !== 1) return false;
        }
        return true;
    }

    countOuts(heroHand, board) {
        if (board.length < 3) return 0;

        let outs = 0;

        const suits = {};
        [...heroHand, ...board].forEach(c => {
            const s = c[1];
            suits[s] = (suits[s] || 0) + 1;
        });

        // Flush draw
        Object.values(suits).forEach(v => {
            if (v === 4) outs += 9;
        });

        return outs;
    }

    handScore(hand, board){
        const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
        return [...hand,...board]
            .map(c => RANKS.indexOf(c[0]))
            .reduce((a,b) => a+b, 0);
    }

    simulateEquity(heroHand, board, players = 2, iterations = 100000) {
        if (!Array.isArray(heroHand) || heroHand.length !== 2) {
            return { win: 0, tie: 0, lose: 1 };
        }

        board = Array.isArray(board) ? board : [];

        let wins = 0, ties = 0;
        const deckBase = this.createDeck().filter(
            c => !heroHand.includes(c) && !board.includes(c)
        );

        for (let i = 0; i < iterations; i++) {
            const deck = this.shuffle([...deckBase]);

            const oppHands = [];
            for (let p = 0; p < players - 1; p++) {
                oppHands.push([deck.pop(), deck.pop()]);
            }

            const fullBoard = [...board];
            while (fullBoard.length < 5) fullBoard.push(deck.pop());

            const heroScore = this.handScore(heroHand, fullBoard);
            const oppScores = oppHands.map(h => this.handScore(h, fullBoard));
            const bestOpp = Math.max(...oppScores);

            if (heroScore > bestOpp) wins++;
            else if (heroScore === bestOpp) ties++;
        }

        return {
            win: wins / iterations,
            tie: ties / iterations,
            lose: 1 - (wins + ties) / iterations
        };
    }
    runAnalysisInWorker(player, room) {
        return new Promise((resolve, reject) => {
            try {
                resolve(this.computeUltimateAnalysis(player, room));
            } catch(err) {
                reject(err)
            }
        });
    }
    clear() {
        this.intervalCounter = 0
        clearInterval(this.betInterval)
        this.betInterval = undefined;
    }
    createDeck(shuffle = true) {
        const deck = [];

        for (const r of RANKS) {
            for (const s of SUITS) {
                deck.push(r + s);
            }
        }

        if (shuffle) this.shuffleDeck(deck);
        return deck;
    }
    shuffleDeck(deck) {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
    }
    dealNewHand(socket, rooms, roomName, io, sanitizeRoomForPlayer, incrementStat) {
        const room = rooms[roomName];
        console.log("dealNewHand roomName: ", roomName)
        room.deck = [
            ...this.createDeck(),
            ...this.createDeck(),
            ...this.createDeck(),
            ...this.createDeck(),
            ...this.createDeck(),
            ...this.createDeck(),
            ...this.createDeck(),
            ...this.createDeck(),
            ...this.createDeck(),
            ...this.createDeck(),
            ...this.createDeck(),
            ...this.createDeck(),
            ...this.createDeck(),
            ...this.createDeck(),
            ...this.createDeck(),
            ...this.createDeck()
        ];
        room.board = [];
        room.pot = 0;
        room.currentBet = 0;
        Object.values(room.players).forEach(p=>{
            p.hand = [room.deck.pop(), room.deck.pop()];
            p.folded = false;
            p.currentBet = 0;
            io.to(p.id).emit('yourHand', p.hand);
        });
        room.board.push(room.deck.pop(), room.deck.pop(), room.deck.pop());

        Object.values(room.players).forEach(p=>{
            io.to(p.id).emit('updateRoom', sanitizeRoomForPlayer(room, p.id));
        });

        clearInterval(this.newHandInterval)
        this.newHandInterval = undefined;

        this.timer(socket, rooms, roomName, io, sanitizeRoomForPlayer, incrementStat)
    }
    dealNewHandTimer(socket, rooms, roomName, io, sanitizeRoomForPlayer, incrementStat) {
        if(!this.newHandInterval) {
            this.newHandIntervalCounter = 0
            this.newHandInterval = setInterval(() => {
                this.newHandIntervalCounter++
                if(this.newHandIntervalCounter === 100) {
                    this.dealNewHand(socket, rooms, roomName, io, sanitizeRoomForPlayer, incrementStat)
                }
            }, 100)
        }
    }
    handleShowdown(socket, rooms, roomName, io, sanitizeRoomForPlayer, incrementStat) {
        let room = rooms[roomName]
        const activePlayers = Object.values(room.players).filter(p => !p.folded);
        if(activePlayers.length === 0) return;
    
        let bestScore = -1;
        let winners = [];
        activePlayers.forEach(p => {
            const score = this.handScore(p.hand, room.board);
            if(score > bestScore) {
                bestScore = score;
                winners = [p];
            } else if(score === bestScore) {
                winners.push(p);
            }
        });
    
        const splitPot = Math.floor(room.pot / winners.length);
        winners.forEach(w => w.chips += splitPot);
    
        io.to(room.name).emit('log', `Showdown! Winners: ${winners.map(w => w.icon).join(', ')} win $${splitPot} each`);
        room.pot = 0;
        room.showDown = true
        Object.values(room.players).forEach(p=>{
            io.to(p.id).emit('updateRoomShowdown', sanitizeRoomForPlayer(room, p.id));
        });
        room.showDown = false

        clearInterval(this.showDownInterval)
        this.showDownInterval = undefined;

        io.to(socket.id).emit('updateBalance', {
            token: jwt.sign({ id: socket.id, chips: 10000 }, SECRET),
            chips: (room?.players[socket.id].chips) ? room?.players[socket.id].chips : 10000
        })
        
        this.dealNewHandTimer(socket, rooms, roomName, io, sanitizeRoomForPlayer)
    }
    showDownTimer(socket, rooms, roomName, io, sanitizeRoomForPlayer, incrementStat) {
        if(!this.showDownInterval) {
            this.showDownIntervalCounter = 0
            let room = rooms[roomName]
            this.showDownInterval = setInterval(() => {
                this.showDownIntervalCounter++
                if(this.showDownIntervalCounter === 100) {
                    this.handleShowdown(socket, rooms, roomName, io, sanitizeRoomForPlayer, incrementStat)
                }
            }, 100)
        }
    }

    timer(socket, rooms, roomName, io, sanitizeRoomForPlayer, incrementStat) {
        if(!this.betInterval) {
            this.intervalCounter = 0
            let room = rooms[roomName]
            // Lähetä analyysi OIKEALLE pelaajalle
            Object.values(room.players).forEach(p => {
                if (!p.folded) {
                    room.timer.runAnalysisInWorker(p, room)
                    .then(analysis => {
                        if (analysis) {
                            io.to(p.id).emit('analysis', analysis);
                        }
                    })
                    .catch(err => {
                        console.error('Analysis worker error:', err);
                    });
                }
            });
            this.betInterval = setInterval(() => {
                this.intervalCounter++
                if(this.intervalCounter === 200) {
                    const room = rooms[roomName];
                    if (!room) return;
                
                    // Ei jaeta liikaa kortteja
                    if (room.board.length >= 5) return;
                
                    // Varmistetaan että pakassa on kortteja
                    if (!Array.isArray(room.deck) || room.deck.length === 0) return;
                
                    // Jaetaan seuraava kortti
                    const nextCard = room.deck.pop();
                    if (!nextCard) return;
                
                    room.board.push(nextCard);
                
    
                    Object.values(room.players).forEach(p=>{
                        io.to(p.id).emit('updateRoom', sanitizeRoomForPlayer(room, p.id));
                    });
                
                    // Lähetä analyysi OIKEALLE pelaajalle
                    Object.values(room.players).forEach(p => {
                        if (!p.folded) {
                            this.runAnalysisInWorker(p, room)
                            .then(analysis => {
                                if (analysis) {
                                    io.to(p.id).emit('analysis', analysis);
                                }
                            })
                            .catch(err => {
                                console.error('Analysis worker error:', err);
                            });
                        }
                    });
                    if(room.board.length === 3) {
                        this.intervalCounter = 0
                        this.timer(socket, rooms, roomName, io, sanitizeRoomForPlayer, incrementStat)
                    }
                    if(room.board.length === 4) {
                        this.intervalCounter = 0
                        this.timer(socket, rooms, roomName, io, sanitizeRoomForPlayer, incrementStat)
                    }
                    if(room.board.length === 5) {
                        clearInterval(this.betInterval)
                        this.betInterval = undefined;
                        this.showDownTimer(socket, rooms, roomName, io, sanitizeRoomForPlayer, incrementStat)
                    }
                }
            }, 100)
        }
    }
}