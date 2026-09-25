const $ = (s) => document.querySelector(s)

const ui = {
  board: $('#board'),
  badge: $('#statusBadge'),
  status: $('#statusText'),
  hint: $('#hint'),
  moves: $('#moves'),
  newBtn: $('#newBtn'),
  undoBtn: $('#undoBtn'),
  copyBtn: $('#copyBtn'),
  playerSide: $('#playerSide'),
  level: $('#level')
}

const W = 9
const H = 10
const MATE = 900000
const CELL_MAX = 48
const CELL_MAX_MOBILE = 38

const PIECE_CHAR = {
  rK: '帅', rA: '仕', rB: '相', rN: '马', rR: '车', rC: '炮', rP: '兵',
  bK: '将', bA: '士', bB: '象', bN: '马', bR: '车', bC: '炮', bP: '卒'
}

const PIECE_VALUE = {
  K: 0,
  R: 500,
  C: 450,
  N: 300,
  B: 240,
  A: 240,
  P: 100
}

const state = {
  board: new Array(W * H).fill(null),
  turn: 'r',
  playerSide: 'r',
  aiSide: 'b',
  thinking: false,
  selected: null,
  legalTo: new Set(),
  lastMove: null,
  history: [],
  moveText: [],
  cells: []
}

let boardLinesSvg = null
let boardLinesRaf = 0
let boardResizeObs = null

init()

function init() {
  buildBoardUI()
  ui.newBtn.addEventListener('click', () => newGame(true))
  ui.undoBtn.addEventListener('click', undo)
  ui.copyBtn.addEventListener('click', copyMoves)
  ui.playerSide.addEventListener('change', () => newGame(true))
  ui.level.addEventListener('change', () => { ui.hint.textContent = '' })
  newGame(false)
}

function buildBoardUI() {
  ui.board.innerHTML = ''
  const grid = document.createElement('div')
  grid.className = 'board-grid'
  ui.board.appendChild(grid)
  state.cells = []
  for (let i = 0; i < W * H; i++) {
    const cell = document.createElement('div')
    cell.className = 'cell'
    cell.dataset.idx = String(i)
    cell.setAttribute('role', 'gridcell')
    grid.appendChild(cell)
    state.cells.push(cell)
  }
  ui.board.addEventListener('click', onBoardClick)
  boardLinesSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  boardLinesSvg.setAttribute('class', 'board-lines')
  boardLinesSvg.setAttribute('aria-hidden', 'true')
  ui.board.prepend(boardLinesSvg)
  if (boardResizeObs) boardResizeObs.disconnect()
  boardResizeObs = new ResizeObserver(() => scheduleBoardLinesUpdate())
  boardResizeObs.observe(ui.board)
  scheduleBoardLinesUpdate()
}

function scheduleBoardLinesUpdate() {
  if (boardLinesRaf) cancelAnimationFrame(boardLinesRaf)
  boardLinesRaf = requestAnimationFrame(() => {
    boardLinesRaf = 0
    syncCellSize()
    updateBoardLinesSvg()
  })
}

function syncCellSize() {
  const w = ui.board.clientWidth
  if (!(w > 0)) return
  const max = window.matchMedia && window.matchMedia('(max-width:520px)').matches ? CELL_MAX_MOBILE : CELL_MAX
  const cell = Math.max(18, Math.min(max, w / W))
  ui.board.style.setProperty('--cell', `${cell}px`)
}

function updateBoardLinesSvg() {
  if (!boardLinesSvg) return
  if (!state.cells.length) return

  const boardRect = ui.board.getBoundingClientRect()
  const w = Math.round(ui.board.clientWidth)
  const h = Math.round(ui.board.clientHeight)
  const snap = (v) => Math.round(v * 2) / 2

  const xs = []
  for (let x = 0; x < W; x++) {
    const cell = state.cells[x]
    const r = cell.getBoundingClientRect()
    xs.push(snap((r.left + r.width / 2) - boardRect.left))
  }
  const ys = []
  for (let y = 0; y < H; y++) {
    const cell = state.cells[y * W]
    const r = cell.getBoundingClientRect()
    ys.push(snap((r.top + r.height / 2) - boardRect.top))
  }

  boardLinesSvg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  boardLinesSvg.setAttribute('preserveAspectRatio', 'none')
  boardLinesSvg.innerHTML = ''

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  g.setAttribute('fill', 'none')
  g.setAttribute('stroke', 'rgba(15,23,42,.38)')
  g.setAttribute('stroke-linecap', 'round')
  g.setAttribute('stroke-linejoin', 'round')
  g.setAttribute('vector-effect', 'non-scaling-stroke')
  g.setAttribute('stroke-width', '2')

  const border = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  border.setAttribute('x', String(xs[0]))
  border.setAttribute('y', String(ys[0]))
  border.setAttribute('width', String(xs[8] - xs[0]))
  border.setAttribute('height', String(ys[9] - ys[0]))
  border.setAttribute('rx', '10')
  g.appendChild(border)

  for (let j = 0; j < H; j++) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line.setAttribute('x1', String(xs[0]))
    line.setAttribute('y1', String(ys[j]))
    line.setAttribute('x2', String(xs[8]))
    line.setAttribute('y2', String(ys[j]))
    g.appendChild(line)
  }

  for (let i = 0; i < W; i++) {
    if (i === 0 || i === 8) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      line.setAttribute('x1', String(xs[i]))
      line.setAttribute('y1', String(ys[0]))
      line.setAttribute('x2', String(xs[i]))
      line.setAttribute('y2', String(ys[9]))
      g.appendChild(line)
    } else {
      const top = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      top.setAttribute('x1', String(xs[i]))
      top.setAttribute('y1', String(ys[0]))
      top.setAttribute('x2', String(xs[i]))
      top.setAttribute('y2', String(ys[4]))
      g.appendChild(top)

      const bot = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      bot.setAttribute('x1', String(xs[i]))
      bot.setAttribute('y1', String(ys[5]))
      bot.setAttribute('x2', String(xs[i]))
      bot.setAttribute('y2', String(ys[9]))
      g.appendChild(bot)
    }
  }

  const palace = (y0) => {
    const d1 = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    d1.setAttribute('x1', String(xs[3]))
    d1.setAttribute('y1', String(ys[y0]))
    d1.setAttribute('x2', String(xs[5]))
    d1.setAttribute('y2', String(ys[y0 + 2]))
    g.appendChild(d1)

    const d2 = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    d2.setAttribute('x1', String(xs[5]))
    d2.setAttribute('y1', String(ys[y0]))
    d2.setAttribute('x2', String(xs[3]))
    d2.setAttribute('y2', String(ys[y0 + 2]))
    g.appendChild(d2)
  }
  palace(0)
  palace(7)

  boardLinesSvg.appendChild(g)
}

function newGame(fromUser) {
  state.playerSide = ui.playerSide.value === 'b' ? 'b' : 'r'
  state.aiSide = state.playerSide === 'r' ? 'b' : 'r'
  state.turn = 'r'
  state.selected = null
  state.legalTo = new Set()
  state.lastMove = null
  state.history = []
  state.moveText = []
  ui.moves.textContent = ''
  ui.hint.textContent = ''
  setBoard(initialBoard())
  render()
  updateStatus()
  if (state.playerSide === 'b') {
    maybeAiMove()
  } else if (fromUser) {
    ui.hint.textContent = '红方先行。点击棋子，再点击落点。'
  }
}

function initialBoard() {
  const b = new Array(W * H).fill(null)
  const set = (x, y, p) => { b[y * W + x] = p }
  const back = ['R', 'N', 'B', 'A', 'K', 'A', 'B', 'N', 'R']
  for (let x = 0; x < W; x++) {
    set(x, 0, 'b' + back[x])
    set(x, 9, 'r' + back[x])
  }
  set(1, 2, 'bC'); set(7, 2, 'bC')
  set(0, 3, 'bP'); set(2, 3, 'bP'); set(4, 3, 'bP'); set(6, 3, 'bP'); set(8, 3, 'bP')
  set(1, 7, 'rC'); set(7, 7, 'rC')
  set(0, 6, 'rP'); set(2, 6, 'rP'); set(4, 6, 'rP'); set(6, 6, 'rP'); set(8, 6, 'rP')
  return b
}

function setBoard(b) {
  state.board = b.slice()
}

function onBoardClick(e) {
  if (state.thinking) return
  const cell = e.target.closest('.cell')
  const pieceBtn = e.target.closest('.piece')
  const idx = cell ? parseInt(cell.dataset.idx, 10) : (pieceBtn ? parseInt(pieceBtn.dataset.idx, 10) : -1)
  if (!(idx >= 0 && idx < W * H)) return

  const piece = state.board[idx]
  const isPlayerTurn = state.turn === state.playerSide
  if (!isPlayerTurn) return

  if (state.selected == null) {
    if (!piece) return
    if (piece[0] !== state.turn) return
    select(idx)
    return
  }

  if (idx === state.selected) {
    clearSelection()
    render()
    return
  }

  if (state.legalTo.has(idx)) {
    doMove({ from: state.selected, to: idx }, true)
    return
  }

  if (piece && piece[0] === state.turn) {
    select(idx)
    return
  }

  ui.hint.textContent = '非法走法。'
}

function select(idx) {
  const p = state.board[idx]
  if (!p || p[0] !== state.turn) return
  state.selected = idx
  state.legalTo = new Set(
    generateLegalMoves(state.board, state.turn)
      .filter(m => m.from === idx)
      .map(m => m.to)
  )
  ui.hint.textContent = state.legalTo.size ? '' : '此子无合法走法。'
  render()
}

function clearSelection() {
  state.selected = null
  state.legalTo = new Set()
}

function render() {
  for (let i = 0; i < W * H; i++) {
    const cell = state.cells[i]
    const p = state.board[i]
    cell.classList.toggle('sel', i === state.selected)
    cell.classList.toggle('to', state.legalTo.has(i) && !p)
    cell.classList.toggle('cap', state.legalTo.has(i) && !!p)
    cell.innerHTML = ''
    if (p) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = `piece ${p[0]}`
      btn.textContent = PIECE_CHAR[p] || p
      btn.dataset.idx = String(i)
      btn.setAttribute('aria-label', pieceAria(p, i))
      cell.appendChild(btn)
    }
  }
  ui.undoBtn.disabled = state.history.length === 0 || state.thinking
}

function pieceAria(p, idx) {
  const { x, y } = xy(idx)
  const side = p[0] === 'r' ? '红' : '黑'
  const name = PIECE_CHAR[p] || p
  return `${side}${name}，位置 ${x + 1} 路 ${y + 1} 行`
}

function updateStatus(extra) {
  const t = state.turn === 'r' ? '红方' : '黑方'
  const who = state.turn === state.playerSide ? '你' : '电脑'
  const inCheck = isInCheck(state.board, state.turn)
  ui.badge.textContent = state.thinking ? '思考中' : (inCheck ? '将军' : '对弈中')
  ui.status.textContent = extra || `${t}走（${who}）。${inCheck ? '当前被将军。' : ''}`
}

function doMove(m, byPlayer) {
  const side = state.turn
  const legal = generateLegalMoves(state.board, side).some(x => x.from === m.from && x.to === m.to)
  if (!legal) {
    ui.hint.textContent = '非法走法。'
    return
  }

  const rec = applyMove(state.board, m.from, m.to)
  state.history.push(rec)
  state.lastMove = { from: m.from, to: m.to, piece: rec.piece, cap: rec.captured }
  appendMoveText(rec, side)

  clearSelection()
  state.turn = opposite(state.turn)
  render()
  const end = checkEnd()
  if (end) {
    updateStatus(end)
    state.thinking = false
    render()
    return
  }
  updateStatus()
  if (byPlayer) maybeAiMove()
}

function maybeAiMove() {
  if (state.turn !== state.aiSide) return
  state.thinking = true
  render()
  updateStatus('电脑思考中…')
  setTimeout(() => {
    try {
      const depth = clampInt(ui.level.value, 1, 3, 2)
      const best = findBestMove(state.board, state.aiSide, depth)
      if (!best) {
        updateStatus('电脑无棋可走。')
        state.thinking = false
        render()
        return
      }
      state.thinking = false
      doMove(best, false)
    } catch (_) {
      state.thinking = false
      updateStatus('发生错误，请重开一局。')
      render()
    }
  }, 40)
}

function undo() {
  if (state.thinking) return
  if (state.history.length === 0) return

  const popOne = () => {
    const rec = state.history.pop()
    if (!rec) return
    undoMove(state.board, rec)
    state.moveText.pop()
  }

  if (state.turn === state.playerSide) {
    popOne()
    popOne()
  } else {
    popOne()
  }

  state.turn = sideToMoveFromHistory()
  clearSelection()
  ui.moves.textContent = formatMoves(state.moveText)
  render()
  updateStatus()
}

function sideToMoveFromHistory() {
  return (state.history.length % 2 === 0) ? 'r' : 'b'
}

function appendMoveText(rec, side) {
  state.moveText.push(moveToText(rec, side))
  ui.moves.textContent = formatMoves(state.moveText)
}

function formatMoves(lines) {
  let out = ''
  for (let i = 0; i < lines.length; i++) {
    const n = Math.floor(i / 2) + 1
    if (i % 2 === 0) out += `${n}. ${lines[i]}`
    else out += `    ${lines[i]}\n`
    if (i % 2 === 0 && i === lines.length - 1) out += '\n'
  }
  return out.trimEnd()
}

function moveToText(rec, side) {
  const p = rec.piece
  const cap = rec.captured ? `x${PIECE_CHAR[rec.captured] || rec.captured}` : ''
  const a = xy(rec.from)
  const b = xy(rec.to)
  const name = PIECE_CHAR[p] || p
  const sideLabel = side === 'r' ? '红' : '黑'
  return `${sideLabel}${name} ${a.x + 1},${a.y + 1}→${b.x + 1},${b.y + 1}${cap}`
}

async function copyMoves() {
  const text = ui.moves.textContent || ''
  if (!text) {
    ui.hint.textContent = '暂无走子记录。'
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    ui.hint.textContent = '已复制走子记录。'
  } catch (_) {
    ui.hint.textContent = '复制失败（浏览器可能不支持）。'
  }
}

function checkEnd() {
  const side = state.turn
  const moves = generateLegalMoves(state.board, side)
  if (moves.length > 0) return null
  const inCheck = isInCheck(state.board, side)
  const win = side === 'r' ? '黑方' : '红方'
  if (inCheck) return `${win}胜（将死）。`
  return `${win}胜（困毙）。`
}

function findBestMove(board, aiSide, depth) {
  const moves = generateLegalMoves(board, aiSide)
  if (!moves.length) return null
  let best = moves[0]
  let bestScore = -Infinity
  let alpha = -Infinity
  let beta = Infinity
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i]
    const rec = applyMove(board, m.from, m.to)
    const score = -negamax(board, opposite(aiSide), aiSide, depth - 1, 1, -beta, -alpha)
    undoMove(board, rec)
    if (score > bestScore) {
      bestScore = score
      best = m
    }
    if (score > alpha) alpha = score
  }
  return { from: best.from, to: best.to }
}

function negamax(board, sideToMove, aiSide, depth, ply, alpha, beta) {
  const endScore = terminalScore(board, sideToMove, aiSide, ply)
  if (endScore != null) return endScore
  if (depth <= 0) return evaluate(board, aiSide) * (sideToMove === aiSide ? 1 : -1)

  const moves = generateLegalMoves(board, sideToMove)
  if (!moves.length) {
    const inCheck = isInCheck(board, sideToMove)
    if (inCheck) return -MATE + ply
    return -MATE + ply
  }

  let best = -Infinity
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i]
    const rec = applyMove(board, m.from, m.to)
    const score = -negamax(board, opposite(sideToMove), aiSide, depth - 1, ply + 1, -beta, -alpha)
    undoMove(board, rec)
    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return best
}

function terminalScore(board, sideToMove, aiSide, ply) {
  const rK = findKing(board, 'r')
  const bK = findKing(board, 'b')
  if (rK < 0) return (aiSide === 'b' ? MATE : -MATE) + ply
  if (bK < 0) return (aiSide === 'r' ? MATE : -MATE) + ply
  return null
}

function evaluate(board, aiSide) {
  let score = 0
  for (let i = 0; i < W * H; i++) {
    const p = board[i]
    if (!p) continue
    const side = p[0]
    const t = p[1]
    const v = PIECE_VALUE[t] || 0
    const { x, y } = xy(i)
    const bonus = positionalBonus(p, x, y)
    const s = (side === aiSide) ? 1 : -1
    score += s * (v + bonus)
  }
  if (isInCheck(board, aiSide)) score -= 20
  if (isInCheck(board, opposite(aiSide))) score += 20
  return score
}

function positionalBonus(p, x, y) {
  const side = p[0]
  const t = p[1]
  if (t === 'P') {
    if (side === 'r') {
      const advance = 9 - y
      const crossed = y <= 4
      return advance * 6 + (crossed ? 18 : 0)
    } else {
      const advance = y
      const crossed = y >= 5
      return advance * 6 + (crossed ? 18 : 0)
    }
  }
  if (t === 'N') return 6
  if (t === 'C') return 4
  return 0
}

function generateLegalMoves(board, side) {
  const out = []
  const pseudo = generatePseudoMoves(board, side)
  for (let i = 0; i < pseudo.length; i++) {
    const m = pseudo[i]
    const rec = applyMove(board, m.from, m.to)
    const ok = !isInCheck(board, side)
    undoMove(board, rec)
    if (ok) out.push(m)
  }
  return out
}

function generatePseudoMoves(board, side) {
  const out = []
  for (let from = 0; from < W * H; from++) {
    const p = board[from]
    if (!p || p[0] !== side) continue
    const t = p[1]
    const { x, y } = xy(from)
    if (t === 'K') genKing(board, side, x, y, from, out)
    else if (t === 'A') genAdvisor(board, side, x, y, from, out)
    else if (t === 'B') genElephant(board, side, x, y, from, out)
    else if (t === 'N') genHorse(board, side, x, y, from, out)
    else if (t === 'R') genRook(board, side, x, y, from, out)
    else if (t === 'C') genCannon(board, side, x, y, from, out)
    else if (t === 'P') genPawn(board, side, x, y, from, out)
  }
  return out
}

function genKing(board, side, x, y, from, out) {
  const deltas = [[1,0],[-1,0],[0,1],[0,-1]]
  for (let i = 0; i < deltas.length; i++) {
    const nx = x + deltas[i][0]
    const ny = y + deltas[i][1]
    if (!inPalace(side, nx, ny)) continue
    pushIfCaptureOrEmpty(board, side, from, nx, ny, out)
  }
  const opp = opposite(side)
  const oppK = findKing(board, opp)
  if (oppK >= 0) {
    const k = xy(oppK)
    if (k.x === x) {
      const step = (k.y > y) ? 1 : -1
      let blocked = false
      for (let ty = y + step; ty !== k.y; ty += step) {
        if (board[ty * W + x]) { blocked = true; break }
      }
      if (!blocked) {
        out.push({ from, to: oppK })
      }
    }
  }
}

function genAdvisor(board, side, x, y, from, out) {
  const deltas = [[1,1],[1,-1],[-1,1],[-1,-1]]
  for (let i = 0; i < deltas.length; i++) {
    const nx = x + deltas[i][0]
    const ny = y + deltas[i][1]
    if (!inPalace(side, nx, ny)) continue
    pushIfCaptureOrEmpty(board, side, from, nx, ny, out)
  }
}

function genElephant(board, side, x, y, from, out) {
  const deltas = [[2,2],[2,-2],[-2,2],[-2,-2]]
  for (let i = 0; i < deltas.length; i++) {
    const nx = x + deltas[i][0]
    const ny = y + deltas[i][1]
    if (!inBoard(nx, ny)) continue
    if (side === 'r' && ny < 5) continue
    if (side === 'b' && ny > 4) continue
    const ex = x + deltas[i][0] / 2
    const ey = y + deltas[i][1] / 2
    if (board[ey * W + ex]) continue
    pushIfCaptureOrEmpty(board, side, from, nx, ny, out)
  }
}

function genHorse(board, side, x, y, from, out) {
  const steps = [
    [2,1,1,0],[2,-1,1,0],[-2,1,-1,0],[-2,-1,-1,0],
    [1,2,0,1],[1,-2,0,-1],[-1,2,0,1],[-1,-2,0,-1]
  ]
  for (let i = 0; i < steps.length; i++) {
    const dx = steps[i][0]
    const dy = steps[i][1]
    const lx = x + steps[i][2]
    const ly = y + steps[i][3]
    if (!inBoard(lx, ly)) continue
    if (board[ly * W + lx]) continue
    const nx = x + dx
    const ny = y + dy
    if (!inBoard(nx, ny)) continue
    pushIfCaptureOrEmpty(board, side, from, nx, ny, out)
  }
}

function genRook(board, side, x, y, from, out) {
  genSlider(board, side, x, y, from, out, false)
}

function genCannon(board, side, x, y, from, out) {
  genSlider(board, side, x, y, from, out, true)
}

function genSlider(board, side, x, y, from, out, cannon) {
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]]
  for (let d = 0; d < dirs.length; d++) {
    const dx = dirs[d][0]
    const dy = dirs[d][1]
    let nx = x + dx
    let ny = y + dy
    let jumped = false
    while (inBoard(nx, ny)) {
      const to = ny * W + nx
      const target = board[to]
      if (!cannon) {
        if (!target) out.push({ from, to })
        else {
          if (target[0] !== side) out.push({ from, to })
          break
        }
      } else {
        if (!jumped) {
          if (!target) out.push({ from, to })
          else jumped = true
        } else {
          if (target) {
            if (target[0] !== side) out.push({ from, to })
            break
          }
        }
      }
      nx += dx
      ny += dy
    }
  }
}

function genPawn(board, side, x, y, from, out) {
  if (side === 'r') {
    pushIfCaptureOrEmpty(board, side, from, x, y - 1, out)
    if (y <= 4) {
      pushIfCaptureOrEmpty(board, side, from, x - 1, y, out)
      pushIfCaptureOrEmpty(board, side, from, x + 1, y, out)
    }
  } else {
    pushIfCaptureOrEmpty(board, side, from, x, y + 1, out)
    if (y >= 5) {
      pushIfCaptureOrEmpty(board, side, from, x - 1, y, out)
      pushIfCaptureOrEmpty(board, side, from, x + 1, y, out)
    }
  }
}

function pushIfCaptureOrEmpty(board, side, from, nx, ny, out) {
  if (!inBoard(nx, ny)) return
  const to = ny * W + nx
  const target = board[to]
  if (!target || target[0] !== side) out.push({ from, to })
}

function applyMove(board, from, to) {
  const piece = board[from]
  const captured = board[to]
  board[to] = piece
  board[from] = null
  return { from, to, piece, captured }
}

function undoMove(board, rec) {
  board[rec.from] = rec.piece
  board[rec.to] = rec.captured
}

function isInCheck(board, side) {
  const kIdx = findKing(board, side)
  if (kIdx < 0) return true
  const opp = opposite(side)
  const k = xy(kIdx)
  const okIdx = findKing(board, opp)
  if (okIdx >= 0) {
    const ok = xy(okIdx)
    if (ok.x === k.x) {
      const step = ok.y > k.y ? 1 : -1
      let blocked = false
      for (let y = k.y + step; y !== ok.y; y += step) {
        if (board[y * W + k.x]) { blocked = true; break }
      }
      if (!blocked) return true
    }
  }
  return isSquareAttacked(board, k.x, k.y, opp)
}

function isSquareAttacked(board, x, y, bySide) {
  if (attackedByRookOrKing(board, x, y, bySide)) return true
  if (attackedByCannon(board, x, y, bySide)) return true
  if (attackedByHorse(board, x, y, bySide)) return true
  if (attackedByPawn(board, x, y, bySide)) return true
  if (attackedByAdvisor(board, x, y, bySide)) return true
  if (attackedByElephant(board, x, y, bySide)) return true
  return false
}

function attackedByRookOrKing(board, x, y, bySide) {
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]]
  for (let d = 0; d < dirs.length; d++) {
    const dx = dirs[d][0]
    const dy = dirs[d][1]
    let nx = x + dx
    let ny = y + dy
    while (inBoard(nx, ny)) {
      const p = board[ny * W + nx]
      if (p) {
        if (p[0] === bySide && (p[1] === 'R' || p[1] === 'K')) return true
        break
      }
      nx += dx
      ny += dy
    }
  }
  return false
}

function attackedByCannon(board, x, y, bySide) {
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]]
  for (let d = 0; d < dirs.length; d++) {
    const dx = dirs[d][0]
    const dy = dirs[d][1]
    let nx = x + dx
    let ny = y + dy
    let screen = false
    while (inBoard(nx, ny)) {
      const p = board[ny * W + nx]
      if (!screen) {
        if (p) screen = true
      } else {
        if (p) {
          if (p[0] === bySide && p[1] === 'C') return true
          break
        }
      }
      nx += dx
      ny += dy
    }
  }
  return false
}

function attackedByHorse(board, x, y, bySide) {
  const srcs = [
    [x - 2, y - 1, x - 1, y],
    [x - 2, y + 1, x - 1, y],
    [x + 2, y - 1, x + 1, y],
    [x + 2, y + 1, x + 1, y],
    [x - 1, y - 2, x, y - 1],
    [x + 1, y - 2, x, y - 1],
    [x - 1, y + 2, x, y + 1],
    [x + 1, y + 2, x, y + 1]
  ]
  for (let i = 0; i < srcs.length; i++) {
    const sx = srcs[i][0]
    const sy = srcs[i][1]
    const lx = srcs[i][2]
    const ly = srcs[i][3]
    if (!inBoard(sx, sy) || !inBoard(lx, ly)) continue
    if (board[ly * W + lx]) continue
    const p = board[sy * W + sx]
    if (p && p[0] === bySide && p[1] === 'N') return true
  }
  return false
}

function attackedByPawn(board, x, y, bySide) {
  if (bySide === 'r') {
    if (inBoard(x, y + 1)) {
      const p = board[(y + 1) * W + x]
      if (p === 'rP') return true
    }
    if (inBoard(x - 1, y)) {
      const p = board[y * W + (x - 1)]
      if (p === 'rP') {
        const py = y
        if (py <= 4) return true
      }
    }
    if (inBoard(x + 1, y)) {
      const p = board[y * W + (x + 1)]
      if (p === 'rP') {
        const py = y
        if (py <= 4) return true
      }
    }
  } else {
    if (inBoard(x, y - 1)) {
      const p = board[(y - 1) * W + x]
      if (p === 'bP') return true
    }
    if (inBoard(x - 1, y)) {
      const p = board[y * W + (x - 1)]
      if (p === 'bP') {
        const py = y
        if (py >= 5) return true
      }
    }
    if (inBoard(x + 1, y)) {
      const p = board[y * W + (x + 1)]
      if (p === 'bP') {
        const py = y
        if (py >= 5) return true
      }
    }
  }
  return false
}

function attackedByAdvisor(board, x, y, bySide) {
  if (!inPalace(bySide, x, y)) return false
  const deltas = [[1,1],[1,-1],[-1,1],[-1,-1]]
  for (let i = 0; i < deltas.length; i++) {
    const sx = x + deltas[i][0]
    const sy = y + deltas[i][1]
    if (!inBoard(sx, sy)) continue
    const p = board[sy * W + sx]
    if (p && p[0] === bySide && p[1] === 'A') {
      if (inPalace(bySide, sx, sy)) return true
    }
  }
  return false
}

function attackedByElephant(board, x, y, bySide) {
  const deltas = [[2,2],[2,-2],[-2,2],[-2,-2]]
  for (let i = 0; i < deltas.length; i++) {
    const sx = x + deltas[i][0]
    const sy = y + deltas[i][1]
    if (!inBoard(sx, sy)) continue
    const p = board[sy * W + sx]
    if (!p || p[0] !== bySide || p[1] !== 'B') continue
    if (bySide === 'r' && (y < 5 || sy < 5)) continue
    if (bySide === 'b' && (y > 4 || sy > 4)) continue
    const ex = x + deltas[i][0] / 2
    const ey = y + deltas[i][1] / 2
    if (board[ey * W + ex]) continue
    return true
  }
  return false
}

function findKing(board, side) {
  const key = side + 'K'
  for (let i = 0; i < W * H; i++) if (board[i] === key) return i
  return -1
}

function inBoard(x, y) {
  return x >= 0 && x < W && y >= 0 && y < H
}

function inPalace(side, x, y) {
  if (x < 3 || x > 5) return false
  if (side === 'r') return y >= 7 && y <= 9
  return y >= 0 && y <= 2
}

function xy(idx) {
  return { x: idx % W, y: Math.floor(idx / W) }
}

function opposite(side) {
  return side === 'r' ? 'b' : 'r'
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(String(v || ''), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}
