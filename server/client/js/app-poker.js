const socket = io();
let mySocketId = null;

let currentRoom = null;
let heroHand = [];
let board = [];
let heroChips = 10000;
let numPlayers = 2000;

async function getBalance(chips) {
    document.querySelectorAll('#home header div.heroPlayer div.chips')[0].textContent = '$' + chips
    document.querySelectorAll('#home header div.heroPlayer')[0].setAttribute('title', 'Balance $' + chips)
}
async function updateBalanceCall() {
    let token = localStorage.getItem('jwt')
    if(token) {
        console.log('token:', token)
        if(token !== 'undefined') {
            socket.emit('updateBalanceCall', {
                token: token
            })
        }
    }
}
async function getRooms(socket) {
    const token = localStorage.getItem('jwt')
    if(token) {
        let data = await fetch('/rooms')
        data.json().then((json) => {
            updateBalanceCall()
            let roomsElem = document.getElementById('rooms')
            if(!json.length) {
                roomsElem.innerHTML = `
                <p>No rooms created yet.<p>
                `
            } else {
                let ul = document.createElement('ul')
                json.forEach((room) => {
                    if(!room.started) {
                        let li = document.createElement('li')
                        let link = document.createElement('a')
                        link.textContent = room.name + ' (' + room.playerCount + ') Open'
                        link.setAttribute('title', 'Join to room ' + room.name + ' (' + room.playerCount + ' players) Open')
                        link.onclick = () => {
                            let roomNameInput = document.getElementById('roomName')
                            roomNameInput.value = room.name
                            let joinBtn = document.getElementById('joinRoomBtn')
                            joinBtn.click()
                        }
                        li.appendChild(link)
                        ul.appendChild(li)
                    }
                })
                roomsElem.innerHTML = '';
                roomsElem.appendChild(ul)
            }
        })
    }
}
async function updateStats() {
    let data = await fetch('/stats')
    data.json().then((json) => {
        let stats = document.getElementById('stats')
        stats.innerHTML = `
        <p>
            <strong>Active players ratio:</strong> <span>${json.derived.active_players_ratio}</span><br />
            <strong>Aggression ratio:</strong> <span>${json.derived.aggression_ratio}</span><br />
            <strong>Average pot per hand:</strong> <span>$ ${json.derived.avg_pot_per_hand}</span><br />
            <strong>Fold rate:</strong> <span>${json.derived.fold_rate}</span><br />
            <strong>Showdown rate</strong> <span>${json.derived.showdown_rate}</span><br />
        </p>
        `
    })
}
// --- Auto-register ---
let jwtToken = localStorage.getItem('jwt')
if(jwtToken) {
    socket.emit('initOldPlayer', jwtToken);
} else {
    socket.emit('init')
}

socket.on('updateBalanceCallFrontend', (data) => {
    getBalance(data.data.chips)
})
socket.on('updateRoomsFrontend', async () => {
    await getRooms(socket)
})
socket.on('userLeftRoom', (room) => {
    const container = document.getElementById('playersContainer');
    container.innerHTML = '';
    Object.values(room.players).forEach(p => {
        const div = document.createElement('div');
    
        div.classList.add('playerCoin');
    
        // 🔹 Oma pelaaja
        if (p.id === mySocketId) {
            div.classList.add('heroPlayer');
        }
    
        // 🔸 Foldattu pelaaja (valinnainen, mutta hyödyllinen)
        if (p.folded) {
            div.classList.add('folded');
        }

        if(!p.currentBet) {
            div.classList.add('sleeping');
        }
        div.innerHTML = `
            <div class="icon">${p.icon}</div>
            <div class="chips">$${p.chips}</div>
            <div class="currentBet">${p.currentBet}</div>
        `;
    
        container.appendChild(div);
    });
    document.getElementById('potAmount').textContent = room.pot;
})
socket.on('initOldPlayerFrontend', (data) => {
    localStorage.setItem('jwt', data.token)
    getRooms(socket)
})
socket.on('initialize', (data) => {
    localStorage.setItem('jwt', data.token)
})
socket.on('connect', async () => {
    mySocketId = socket.id;
    updateStats()
    await getRooms(socket)
});
socket.on("chips", data => {
    document.querySelectorAll('#home header div.heroPlayer div.chips')[0].textContent = '$' + data.chips
    document.querySelectorAll('#home header div.heroPlayer')[0].setAttribute('title', 'Balance $' + data.chips)
})
socket.on('updateBalance', data => {
    document.querySelectorAll('#home header div.heroPlayer div.chips')[0].textContent = '$' + data.chips
    document.querySelectorAll('#home header div.heroPlayer')[0].setAttribute('title', 'Balance $' + data.chips)
    localStorage.setItem('jwt', data.token)
})
socket.on('registered', data => {
    heroChips = data.chips;
    document.querySelectorAll('#home header div.heroPlayer div.chips')[0].textContent = '$' + data.chips
    document.querySelectorAll('#home header div.heroPlayer')[0].setAttribute('title', 'Balance $' + data.chips)
});

document.getElementById('leaveRoomBtn').addEventListener('click', async ()=>{
    const roomName = document.getElementById('roomName').value.trim();
    if(!roomName) return alert('You are currently not in any room');
    document.body.classList.remove('room-active');
    socket.emit('leaveRoom', {
        room: roomName,
        token: localStorage.getItem('jwt')
    });
    await getRooms(socket)
})
// --- Join Room ---
document.getElementById('joinRoomBtn').addEventListener('click', ()=>{
    const roomName = document.getElementById('roomName').value.trim();
    if(!roomName) return alert('Enter room name');
    currentRoom = roomName;
    const token = localStorage.getItem('jwt')
    if(token) {
        socket.emit('joinRoom', roomName, token);
    }

    // Näytetään pelialue
    document.body.classList.add('room-active');
    document.getElementById('roomTitle').textContent = currentRoom
});

// --- Your hand ---
socket.on('yourHand', hand=>{
    heroHand = hand;
    document.getElementById('handCards').textContent = heroHand.join(' ');
});
let betInterval;
let intervalCounter = 0
function betTimer() {
    if(!betInterval) {
        let betTime = document.getElementById('betTime')
        let progressStatusText = document.querySelectorAll('p.progressStatusText')[0]
        betTime.setAttribute('max', 200)
        betInterval = setInterval(() => {
            intervalCounter++
            betTime.setAttribute('value', intervalCounter)
            progressStatusText.textContent = "Next card in " + (20-(20*(intervalCounter/200))).toFixed(2) + ' sec'
            if(intervalCounter === 200) {
                intervalCounter = 0
                betTime.removeAttribute('value')
            }
        }, 100)
    }
}

let newHandInterval;
let newHandIntervalCounter = 0
function newHandTimer() {
    if(!newHandInterval) {
        showdownIntervalCounter = 0
        let betTime = document.getElementById('betTime')
        let progressStatusText = document.querySelectorAll('p.progressStatusText')[0]
        betTime.setAttribute('max', 100)
        newHandInterval = setInterval(() => {
            newHandIntervalCounter++
            betTime.setAttribute('value', newHandIntervalCounter)
            progressStatusText.textContent = "New hand in " + (10-(10*(newHandIntervalCounter/100))).toFixed(2) + ' sec'
            if(newHandIntervalCounter === 100) {
                newHandIntervalCounter = 0
                betTime.removeAttribute('value')
                clearInterval(newHandInterval)
                newHandInterval = undefined;
            }
        }, 100)
    }
}
let showdownInterval;
let showdownIntervalCounter = 0
function showdownTimer(socket, roomName) {
    if(!showdownInterval) {
        showdownIntervalCounter = 0
        let betTime = document.getElementById('betTime')
        let progressStatusText = document.querySelectorAll('p.progressStatusText')[0]
        betTime.setAttribute('max', 100)
        showdownInterval = setInterval(() => {
            showdownIntervalCounter++
            betTime.setAttribute('value', showdownIntervalCounter)
            progressStatusText.textContent = "Showdown in " + (10-(10*(showdownIntervalCounter/100))).toFixed(2) + ' sec'
            if(showdownIntervalCounter === 100) {
                showdownIntervalCounter = 0
                betTime.removeAttribute('value')
                clearInterval(showdownInterval)
                showdownInterval = undefined;
                let token = localStorage.getItem('jwt')
                if(token !== 'undefined') {
                    socket.emit('updateChips', token, roomName)
                }
                newHandTimer()
            }
        }, 100)
    }
}
socket.on('updateFrontPageRooms', async (data) => {
    localStorage.setItem('jwt', data.token)
    await getRooms(socket)
    getBalance(data.chips)
})
socket.on('startRoom', () => {
    document.querySelectorAll('button.newHandBtn')[0].classList.add('hide')
    newHandTimer()
})
// --- Update Room ---
socket.on('updateRoomShowdown', async room=> {
    board = room.board;
    clearInterval(betInterval)
    betInterval = undefined;
    heroChips = room.players[mySocketId].chips
    document.getElementById('controls').classList.add('hide')
    document.getElementById('boardArea').classList.add('hide')
    document.querySelectorAll('.deeperAnalysis')[0].classList.add('hide')

    const container = document.getElementById('playersContainer');
    container.innerHTML = '';
    Object.values(room.players).forEach(p => {
        const div = document.createElement('div');
    
        div.classList.add('playerCoin');
    
        // 🔹 Oma pelaaja
        if (p.id === mySocketId) {
            div.classList.add('heroPlayer');
        }
    
        // 🔸 Foldattu pelaaja (valinnainen, mutta hyödyllinen)
        if (p.folded) {
            div.classList.add('folded');
        }

        if(!p.currentBet) {
            div.classList.add('sleeping');
        }
        div.innerHTML = `
            <div class="icon">${p.icon}</div>
            <div class="chips">$${p.chips}</div>
            <div class="currentBet">${p.currentBet}</div>
        `;
    
        container.appendChild(div);
    });
    document.getElementById('potAmount').textContent = room.pot;
})

let autoRaise50 = document.querySelectorAll('#autoRaise50')
autoRaise50[0].addEventListener('change', (event)=>{
    if(event.target.checked) {
        document.getElementById('raise50').click()
    }
})

let autoRaise100 = document.querySelectorAll('#autoRaise100')
autoRaise100[0].addEventListener('change', (event)=>{
    if(event.target.checked) {
        document.getElementById('raise100').click()
    }
})

let autoRaise150 = document.querySelectorAll('#autoRaise150')
autoRaise150[0].addEventListener('change', (event)=>{
    if(event.target.checked) {
        document.getElementById('raise150').click()
    }
})

let autoRaise200 = document.querySelectorAll('#autoRaise200')
autoRaise200[0].addEventListener('change', (event)=>{
    if(event.target.checked) {
        document.getElementById('raise200').click()
    }
})

let autoRaise400 = document.querySelectorAll('#autoRaise400')
autoRaise400[0].addEventListener('change', (event)=>{
    if(event.target.checked) {
        document.getElementById('raise400').click()
    }
})
let autoRaise800 = document.querySelectorAll('#autoRaise800')
autoRaise800[0].addEventListener('change', (event)=>{
    if(event.target.checked) {
        document.getElementById('raise800').click()
    }
})

let autoBetUpdateCounter = {
    three: 0,
    four: 0
}
socket.on('updateRoom', async room => {
    board = room.board;
    if(board.length === 5) {
        clearInterval(betInterval)
        betInterval = undefined;
        intervalCounter = 0
        showdownTimer(socket, room.name)
        autoBetUpdateCounter.four = 0
        autoBetUpdateCounter.three = 0
        document.querySelectorAll('.newHandBtn')[0].classList.add('hide')
        document.getElementById('betTime').removeAttribute('value')
        document.getElementById('controls').classList.add('hide')
        document.querySelectorAll('.logs')[0].classList.remove('hide')
    }
    if(board.length === 4) {
        clearInterval(betInterval)
        betInterval = undefined;
        betTimer()
        if(!autoBetUpdateCounter.four) {
            intervalCounter = 0
            let autoRaise50 = document.querySelectorAll('#autoRaise50')[0]
            let autoRaise100 = document.querySelectorAll('#autoRaise100')[0]
            let autoRaise150 = document.querySelectorAll('#autoRaise150')[0]
            let autoRaise200 = document.querySelectorAll('#autoRaise200')[0]
            let autoRaise400 = document.querySelectorAll('#autoRaise400')[0]
            let autoRaise800 = document.querySelectorAll('#autoRaise800')[0]
            if(autoRaise50.checked) {
                document.getElementById('raise50').click()
            }
            if(autoRaise100.checked) {
                document.getElementById('raise100').click()
            }
            if(autoRaise150.checked) {
                document.getElementById('raise150').click()
            }
            if(autoRaise200.checked) {
                document.getElementById('raise200').click()
            }
            if(autoRaise400.checked) {
                document.getElementById('raise800').click()
            }
            if(autoRaise800.checked) {
                document.getElementById('raise800').click()
            }
            autoBetUpdateCounter.four++
        }
        document.querySelectorAll('.newHandBtn')[0].classList.add('hide')
        document.getElementById('controls').classList.remove('hide')
    }
    if(board.length === 3) {
        clearInterval(betInterval)
        betInterval = undefined;
        betTimer()
        if(!autoBetUpdateCounter.three) {
            intervalCounter = 0
            let autoRaise50 = document.querySelectorAll('#autoRaise50')[0]
            let autoRaise100 = document.querySelectorAll('#autoRaise100')[0]
            let autoRaise150 = document.querySelectorAll('#autoRaise150')[0]
            let autoRaise200 = document.querySelectorAll('#autoRaise200')[0]
            let autoRaise400 = document.querySelectorAll('#autoRaise400')[0]
            let autoRaise800 = document.querySelectorAll('#autoRaise800')[0]
            if(autoRaise50.checked) {
                document.getElementById('raise50').click()
            }
            if(autoRaise100.checked) {
                document.getElementById('raise100').click()
            }
            if(autoRaise150.checked) {
                document.getElementById('raise150').click()
            }
            if(autoRaise200.checked) {
                document.getElementById('raise200').click()
            }
            if(autoRaise400.checked) {
                document.getElementById('raise800').click()
            }
            if(autoRaise800.checked) {
                document.getElementById('raise800').click()
            }
            autoBetUpdateCounter.three++
        }
        document.getElementById('boardArea').classList.remove('hide')
        document.getElementById('controls').classList.remove('hide')
        document.querySelectorAll('.deeperAnalysis')[0].classList.remove('hide')
        document.querySelectorAll('.newHandBtn')[0].classList.add('hide')
    }
    if(!board.length && !room.showDown) {
        document.getElementById('boardArea').classList.add('hide')
        document.getElementById('controls').classList.add('hide')
        document.querySelectorAll('.logs')[0].classList.add('hide')
        document.querySelectorAll('.deeperAnalysis')[0].classList.add('hide')
    }
    document.getElementById('boardCards').textContent = board.join(' ');

    const container = document.getElementById('playersContainer');
    container.innerHTML = '';
    Object.values(room.players).forEach(p => {
        const div = document.createElement('div');
    
        div.classList.add('playerCoin');
    
        // 🔹 Oma pelaaja
        if (p.id === mySocketId) {
            div.classList.add('heroPlayer');
        }
    
        // 🔸 Foldattu pelaaja (valinnainen, mutta hyödyllinen)
        if (p.folded) {
            div.classList.add('folded');
        }

        if(!p.currentBet) {
            div.classList.add('sleeping');
        }
        div.innerHTML = `
            <div class="icon">${p.icon}</div>
            <div class="chips">$${p.chips}</div>
            <div class="currentBet">${p.currentBet}</div>
        `;
    
        container.appendChild(div);
    });
    document.getElementById('potAmount').textContent = room.pot;
});
socket.on('analysis', d => {
    if (!d) return;

    // Turvamuuttujat null/undefined arvoille
    const equity = typeof d.equity === 'number' ? d.equity : 0;
    const tie = typeof d.tie === 'number' ? d.tie : 0;
    const lose = typeof d.lose === 'number' ? d.lose : 0;
    const potOdds = typeof d.potOdds === 'number' ? d.potOdds : 0;
    const outs = typeof d.outsPercent === 'number' ? d.outsPercent : 0;
    const rhs = typeof d.rhs === 'number' ? d.rhs : 0;
    const ev = typeof d.ev === 'number' ? d.ev : 'N/A';
    
    // Board texture
    const boardTexture = d.boardTexture 
        ? `${d.boardTexture.type} (Suits: ${d.boardTexture.suits.join(', ')}, Ranks: ${d.boardTexture.ranks.join(', ')})`
        : 'N/A';
    
    // Player stats
    const stats = d.stats || {};
    const aggression = typeof stats.aggression === 'number' ? stats.aggression.toFixed(2) : 'N/A';
    const foldFreq = typeof stats.foldFreq === 'number' ? stats.foldFreq.toFixed(2) : 'N/A';
    const showdownWin = typeof stats.showdownWinPct === 'number' ? stats.showdownWinPct.toFixed(2) : 'N/A';

    // Decision quality
    let decisionClass = 'neutral';
    if (d.decisionQuality === 1) decisionClass = 'good';
    else if (d.decisionQuality === -1) decisionClass = 'bad';
    updateEquityCoins({
        win: (equity*100).toFixed(2),
        tie: (tie*100).toFixed(2),
        lose: (lose*100).toFixed(2)
    })
    const analysisBox = document.getElementById('analysisBox');
    analysisBox.innerHTML = `
        <b>Equity:</b> ${(equity*100).toFixed(1)}% | <b>Tie:</b> ${(tie*100).toFixed(1)}% | <b>Lose:</b> ${(lose*100).toFixed(1)}%<br>
        <b>Pot Odds:</b> ${(potOdds*100).toFixed(1)}%<br>
        <b>Outs %:</b> ${outs.toFixed(1)}%<br>
        <b>Board Texture:</b> ${boardTexture}<br>
        <b>Relative Hand Strength:</b> ${rhs.toFixed(3)} / 1<br>
        <b>Estimated EV:</b> ${ev !== 'N/A' ? ev.toFixed(2) : 'N/A'}<br>
        <b>Decision Quality:</b> <span class="${decisionClass}">
            ${decisionClass === 'good' ? 'GOOD' : decisionClass === 'bad' ? 'BAD' : 'OK'}
        </span><br>
        <b>Player Stats:</b> Aggression: ${aggression}, Fold freq: ${foldFreq}, Showdown win %: ${showdownWin}
    `;
});
// --- Log ---
socket.on('log', msg=>{
    const pre = document.getElementById('log');
    pre.textContent += msg + '\n';
});

// --- Buttons ---
document.querySelectorAll('.newHandBtn')[0].addEventListener('click', ()=>{
    if(!currentRoom) return alert('Join a room first');
    socket.emit('dealNewHand', currentRoom);
});

document.getElementById('callBtn').addEventListener('click', () => {
    if(!currentRoom) return alert('Join a room first');
    socket.emit('playerAction', {
        roomName: currentRoom,
        action: 'call'
    });
});
document.getElementById('allIn').addEventListener('click', ()=>{
        // Lähetetään serverille pyyntö panoksesta
        socket.emit('playerAction', { 
            roomName: currentRoom, 
            action: 'raise', 
            amount: heroChips
        });
})
document.getElementById('raise50').addEventListener('click', ()=>{
    if(!currentRoom) return alert('Join a room first');
    // Lähetetään serverille pyyntö panoksesta
    socket.emit('playerAction', { 
        roomName: currentRoom, 
        action:'raise', 
        amount: 50 
    });
});
document.getElementById('raise100').addEventListener('click', ()=>{
    if(!currentRoom) return alert('Join a room first');
    // Lähetetään serverille pyyntö panoksesta
    socket.emit('playerAction', { 
        roomName: currentRoom, 
        action:'raise', 
        amount: 100 
    });
});
document.getElementById('raise150').addEventListener('click', ()=>{
    if(!currentRoom) return alert('Join a room first');
    // Lähetetään serverille pyyntö panoksesta
    socket.emit('playerAction', { 
        roomName: currentRoom, 
        action:'raise', 
        amount: 150 
    });
});
document.getElementById('raise200').addEventListener('click', ()=>{
    if(!currentRoom) return alert('Join a room first');
    // Lähetetään serverille pyyntö panoksesta
    socket.emit('playerAction', { 
        roomName: currentRoom, 
        action:'raise', 
        amount: 200 
    });
});
document.getElementById('raise400').addEventListener('click', ()=>{
    if(!currentRoom) return alert('Join a room first');
    // Lähetetään serverille pyyntö panoksesta
    socket.emit('playerAction', { 
        roomName: currentRoom, 
        action:'raise', 
        amount: 400 
    });
});
document.getElementById('raise800').addEventListener('click', ()=>{
    if(!currentRoom) return alert('Join a room first');
    // Lähetetään serverille pyyntö panoksesta
    socket.emit('playerAction', { 
        roomName: currentRoom, 
        action:'raise', 
        amount: 800 
    });
});
document.getElementById('raiseBtn').addEventListener('click', ()=>{
    if(!currentRoom) return alert('Join a room first');
    const input = document.getElementById('raiseInput');
    const amount = parseInt(input.value);
    if(isNaN(amount) || amount<=0 || amount>heroChips) return alert('Invalid amount');

    // Lähetetään serverille pyyntö panoksesta
    socket.emit('playerAction', { 
        roomName: currentRoom, 
        action:'raise', 
        amount 
    });
});


document.getElementById('foldBtn').addEventListener('click', ()=>{
    if(!currentRoom) return alert('Join a room first');
    socket.emit('playerAction',{roomName: currentRoom, action:'fold'});
});

// --- Update Equity Coins ---
function updateEquityCoins(eq){
    const container = document.getElementById('equityCoins');
    container.innerHTML = '';

    const winCoin = document.createElement('div');
    winCoin.className = 'equity-coin win';
    winCoin.textContent = parseFloat(eq.win).toFixed(0) + '%';
    winCoin.title = 'Win ' + parseFloat(eq.win).toFixed(0) + '%';
    container.appendChild(winCoin);

    const tieCoin = document.createElement('div');
    tieCoin.className = 'equity-coin tie';
    tieCoin.textContent = parseFloat(eq.tie).toFixed(0) + '%';
    tieCoin.title = 'Tie ' + parseFloat(eq.tie).toFixed(0) + '%';
    container.appendChild(tieCoin);

    const loseCoin = document.createElement('div');
    loseCoin.className = 'equity-coin lose';
    loseCoin.textContent = parseFloat(eq.lose).toFixed(0) + '%';
    loseCoin.title = 'Lose ' + parseFloat(eq.lose).toFixed(0) + '%';
    container.appendChild(loseCoin);
}
