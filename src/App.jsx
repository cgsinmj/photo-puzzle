import { useState, useCallback, useRef, useEffect } from "react";

const DIFFICULTIES = [
  { label: "3×3", size: 3, moves: 20 },
  { label: "4×4", size: 4, moves: 50 },
  { label: "5×5", size: 5, moves: 100 },
];

function shufflePuzzle(size, shuffleMoves) {
  const total = size * size;
  const tiles = Array.from({ length: total }, (_, i) => i);
  let blankIdx = total - 1;
  const getNeighbors = (idx) => {
    const row = Math.floor(idx / size), col = idx % size;
    const n = [];
    if (row > 0) n.push(idx - size);
    if (row < size - 1) n.push(idx + size);
    if (col > 0) n.push(idx - 1);
    if (col < size - 1) n.push(idx + 1);
    return n;
  };
  let lastMoved = -1;
  for (let i = 0; i < shuffleMoves; i++) {
    const neighbors = getNeighbors(blankIdx).filter((n) => n !== lastMoved);
    const pick = neighbors[Math.floor(Math.random() * neighbors.length)];
    lastMoved = blankIdx;
    [tiles[blankIdx], tiles[pick]] = [tiles[pick], tiles[blankIdx]];
    blankIdx = pick;
  }
  return tiles;
}

function isSolved(tiles) { return tiles.every((t, i) => t === i); }

// Web Audio API로 사운드 생성 (외부 파일 불필요)
const audioCtx = typeof window !== "undefined" ? new (window.AudioContext || window.webkitAudioContext)() : null;

function playMove() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = "sine";
  osc.frequency.setValueAtTime(420, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(320, audioCtx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.12);
}

function playWin() {
  if (!audioCtx) return;
  // 짧은 팡파르: 도-미-솔-도 아르페지오
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = "sine";
    const t = audioCtx.currentTime + i * 0.13;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.start(t);
    osc.stop(t + 0.35);
  });
}

export default function PhotoPuzzle() {
  const [imageUrl, setImageUrl] = useState(null); // 정사각형으로 크롭된 dataURL
  const [diffIdx, setDiffIdx] = useState(0);
  const [tiles, setTiles] = useState(null);
  const [moves, setMoves] = useState(0);
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);
  const [solved, setSolved] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [hintCooldown, setHintCooldown] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [solvedPhase, setSolvedPhase] = useState(null); // null | 'reveal' | 'celebrate'
  const [soundOn, setSoundOn] = useState(true);
  const fileRef = useRef();
  const intervalRef = useRef();
  const hintTimerRef = useRef();

  const size = DIFFICULTIES[diffIdx].size;
  const total = size * size;

  useEffect(() => {
    if (running) { intervalRef.current = setInterval(() => setTime((t) => t + 1), 1000); }
    return () => clearInterval(intervalRef.current);
  }, [running]);

  // FileReader로 읽은 뒤 캔버스에서 정사각형으로 잘라 dataURL 생성
  const loadImageFile = (file) => {
    if (!file) return;
    const ok = file.type.startsWith("image/") ||
      /\.(jpe?g|png|gif|webp|bmp|svg|tiff?|ico)$/i.test(file.name);
    if (!ok) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const SIZE = 600;
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        // 가로/세로 중 짧은 쪽을 기준으로 가운데 크롭
        const s = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - s) / 2;
        const sy = (img.naturalHeight - s) / 2;
        ctx.drawImage(img, sx, sy, s, s, 0, 0, SIZE, SIZE);
        setImageUrl(canvas.toDataURL("image/jpeg", 0.95));
        setTiles(null);
        setSolved(false);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleImage = (e) => loadImageFile(e.target.files[0]);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    loadImageFile(e.dataTransfer.files[0]);
  };
  const handleDragOver = (e) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);

  const startGame = useCallback(() => {
    setTiles(shufflePuzzle(size, DIFFICULTIES[diffIdx].moves));
    setMoves(0); setTime(0); setSolved(false); setRunning(true); setSolvedPhase(null);
  }, [size, diffIdx]);

  const handleTileClick = (idx) => {
    if (solved || !tiles) return;
    const blankIdx = tiles.indexOf(total - 1);
    const row = Math.floor(idx / size), blankRow = Math.floor(blankIdx / size);
    const col = idx % size, blankCol = blankIdx % size;
    const isAdj =
      (Math.abs(row - blankRow) === 1 && col === blankCol) ||
      (Math.abs(col - blankCol) === 1 && row === blankRow);
    if (!isAdj) return;
    const t = [...tiles];
    [t[blankIdx], t[idx]] = [t[idx], t[blankIdx]];
    setTiles(t);
    setMoves((m) => m + 1);
    if (isSolved(t)) {
      setSolved(true); setRunning(false);
      if (soundOn) playWin();
      setSolvedPhase("reveal");
      setTimeout(() => setSolvedPhase("celebrate"), 3500);
    } else {
      if (soundOn) playMove();
    }
  };

  const handleHint = () => {
    if (hintCooldown || !tiles || solved) return;
    setShowHint(true); setHintCooldown(true);
    hintTimerRef.current = setTimeout(() => {
      setShowHint(false);
      setTimeout(() => setHintCooldown(false), 5000);
    }, 2000);
  };

  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // 타일 배경: 이미지가 600×600 정사각형이므로 background-size + position 계산이 정확함
  const tileBg = (tileRow, tileCol) => ({
    position: "absolute",
    inset: 0,
    backgroundImage: `url(${imageUrl})`,
    // N×N 분할: 타일 하나가 100%이므로 전체 이미지는 N*100%
    backgroundSize: `${size * 100}% ${size * 100}%`,
    // percentage position: col/(N-1)*100%, row/(N-1)*100%
    backgroundPosition: `${size === 1 ? 0 : (tileCol / (size - 1)) * 100}% ${size === 1 ? 0 : (tileRow / (size - 1)) * 100}%`,
    backgroundRepeat: "no-repeat",
  });

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0a0f",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "'Courier New', monospace", color: "#e8e0d0", padding: "24px",
    }}>
      <h1 style={{ fontSize: "clamp(1.4rem,4vw,2.2rem)", letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: "6px", color: "#f0e6c8", fontWeight: 400 }}>
        사진 퍼즐
      </h1>
      <p style={{ color: "#6b6050", fontSize: "0.78rem", letterSpacing: "0.15em", marginBottom: "28px" }}>
        PHOTO PUZZLE GAME
      </p>

      {/* Controls */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap", justifyContent: "center" }}>
        <button onClick={() => fileRef.current.click()} style={btn("#2a2520", "#c8a96e")}>
          📷 사진 업로드
        </button>
        <input ref={fileRef} type="file" accept="image/*,.heic,.heif" onChange={handleImage} style={{ display: "none" }} />

        {DIFFICULTIES.map((d, i) => (
          <button key={d.label}
            onClick={() => { setDiffIdx(i); setTiles(null); setSolved(false); }}
            style={btn(diffIdx === i ? "#3a2e1e" : "#1a1814", diffIdx === i ? "#c8a96e" : "#6b6050")}>
            {d.label}
          </button>
        ))}

        <button onClick={startGame} disabled={!imageUrl}
          style={btn(imageUrl ? "#1e3a2e" : "#151515", imageUrl ? "#6ec88e" : "#333")}>
          ▶ 시작
        </button>

        {tiles && !solved && (
          <button onClick={handleHint} disabled={hintCooldown}
            style={btn(hintCooldown ? "#1a1520" : "#2a1e35", hintCooldown ? "#444" : "#c86ec8")}>
            {showHint ? "👁 보는중..." : hintCooldown ? "⏳ 쿨다운" : "💡 힌트"}
          </button>
        )}

        {/* Sound toggle */}
        <button
          onClick={() => setSoundOn((v) => !v)}
          title="사운드 켜기/끄기"
          style={btn(soundOn ? "#1a2a1a" : "#1a1a1a", soundOn ? "#6ec88e" : "#555")}
        >
          {soundOn ? "🔊 소리 ON" : "🔇 소리 OFF"}
        </button>
      </div>

      {/* Stats */}
      {tiles && (
        <div style={{ display: "flex", gap: "32px", marginBottom: "18px", fontSize: "0.82rem", letterSpacing: "0.1em" }}>
          <span style={{ color: "#c8a96e" }}>이동: <strong>{moves}</strong></span>
          <span style={{ color: "#6ec8c8" }}>시간: <strong>{fmt(time)}</strong></span>
          <span style={{ color: "#c86e9e" }}>난이도: <strong>{DIFFICULTIES[diffIdx].label}</strong></span>
        </div>
      )}

      {/* Board */}
      {imageUrl && tiles ? (
        <div style={{ position: "relative" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${size}, 1fr)`,
            gap: "3px",
            background: "#1a1510",
            padding: "3px",
            borderRadius: "8px",
            boxShadow: "0 0 40px rgba(200,169,110,0.15)",
            width: "min(80vw, 480px)",
            height: "min(80vw, 480px)",
          }}>
            {tiles.map((tileVal, idx) => {
              const isBlank = tileVal === total - 1;
              const tileRow = Math.floor(tileVal / size);
              const tileCol = tileVal % size;
              return (
                <div
                  key={idx}
                  onClick={() => handleTileClick(idx)}
                  style={{
                    position: "relative",
                    overflow: "hidden",
                    cursor: isBlank ? "default" : "pointer",
                    borderRadius: "4px",
                    background: "#0a0a0f",
                    transition: "transform 0.08s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isBlank) {
                      e.currentTarget.style.transform = "scale(0.96)";
                      e.currentTarget.style.boxShadow = "0 0 12px rgba(200,169,110,0.4)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  {!isBlank && <div style={tileBg(tileRow, tileCol)} />}
                </div>
              );
            })}
          </div>

          {/* Hint overlay */}
          {showHint && (
            <div style={{ position: "absolute", inset: 0, borderRadius: "8px", overflow: "hidden", zIndex: 10 }}>
              <img src={imageUrl} alt="hint" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{
                position: "absolute", bottom: "12px", left: 0, right: 0,
                textAlign: "center", fontSize: "0.78rem",
                color: "rgba(255,255,255,0.8)", letterSpacing: "0.1em",
                textShadow: "0 1px 4px rgba(0,0,0,0.8)",
              }}>
                👁 원본 사진 힌트
              </div>
            </div>
          )}

          {/* 완성 연출: 1단계 - 원본 이미지 페이드인 */}
          {solvedPhase === "reveal" && (
            <div style={{
              position: "absolute", inset: 0, borderRadius: "8px", overflow: "hidden", zIndex: 10,
              animation: "revealFade 1.2s ease forwards",
            }}>
              <style>{`
                @keyframes revealFade { from { opacity: 0; } to { opacity: 1; } }
                @keyframes celebrateFade { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
              `}</style>
              <img src={imageUrl} alt="complete" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "3rem",
                animation: "revealFade 0.5s ease 1s forwards",
                opacity: 0,
              }}>🎉</div>
            </div>
          )}

          {/* 완성 연출: 2단계 - 완성 화면 */}
          {solvedPhase === "celebrate" && (
            <div style={{
              position: "absolute", inset: 0,
              background: "rgba(10,10,15,0.88)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              borderRadius: "8px", backdropFilter: "blur(6px)",
              animation: "celebrateFade 0.8s ease forwards",
              zIndex: 20,
            }}>
              <div style={{ fontSize: "3.5rem", marginBottom: "14px" }}>🎉</div>
              <p style={{ fontSize: "1.6rem", letterSpacing: "0.25em", color: "#c8a96e", marginBottom: "10px" }}>완성!</p>
              <p style={{ fontSize: "0.9rem", color: "#a09080", marginBottom: "28px" }}>
                {moves}번 이동 · {fmt(time)}
              </p>
              <button onClick={startGame} style={btn("#1e3a2e", "#6ec88e")}>다시 시작</button>
            </div>
          )}
        </div>

      ) : imageUrl ? (
        /* 이미지 올라온 상태 - 시작 전 미리보기 */
        <div
          onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
          style={{
            width: "min(80vw,480px)", height: "min(80vw,480px)",
            borderRadius: "8px", overflow: "hidden",
            border: `1px solid ${isDragOver ? "#c8a96e" : "#2a2520"}`,
            position: "relative", transition: "border-color 0.2s",
          }}
        >
          <img src={imageUrl} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          {isDragOver && (
            <div style={{
              position: "absolute", inset: 0, background: "rgba(10,10,15,0.7)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1rem", letterSpacing: "0.1em", color: "#c8a96e",
            }}>🖼️ 새 사진으로 교체</div>
          )}
        </div>

      ) : (
        /* 업로드 전 드롭존 */
        <div
          onClick={() => fileRef.current.click()}
          onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
          style={{
            width: "min(80vw,480px)", height: "min(80vw,480px)",
            border: `2px dashed ${isDragOver ? "#c8a96e" : "#3a3020"}`,
            borderRadius: "8px",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
            color: isDragOver ? "#c8a96e" : "#4a4030",
            background: isDragOver ? "rgba(200,169,110,0.06)" : "transparent",
            transition: "all 0.2s",
          }}
        >
          <div style={{ fontSize: "3rem", marginBottom: "12px", transform: isDragOver ? "scale(1.2)" : "scale(1)", transition: "transform 0.2s" }}>
            {isDragOver ? "🖼️" : "📷"}
          </div>
          <p style={{ letterSpacing: "0.1em", fontSize: "0.9rem", marginBottom: "6px" }}>
            {isDragOver ? "여기에 놓으세요!" : "사진을 업로드하세요"}
          </p>
          <p style={{ fontSize: "0.72rem", color: isDragOver ? "#a08050" : "#3a3028", letterSpacing: "0.05em" }}>
            {isDragOver ? "" : "클릭하거나 사진을 드래그하세요"}
          </p>
        </div>
      )}

      <p style={{ marginTop: "20px", fontSize: "0.72rem", color: "#3a3028", letterSpacing: "0.08em" }}>
        빈 칸과 인접한 조각을 클릭해서 이동하세요
      </p>

      {/* 제작자 / 블로그 */}
      <div style={{
        marginTop: "32px",
        borderTop: "1px solid #1e1a14",
        paddingTop: "16px",
        textAlign: "center",
      }}>
        <p style={{ fontSize: "0.72rem", color: "#4a4030", letterSpacing: "0.06em", marginBottom: "6px" }}>
          Made by
        </p>
        <a
          href="https://blog.naver.com/pickhaezoom"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: "0.85rem",
            color: "#c8a96e",
            letterSpacing: "0.12em",
            textDecoration: "none",
            borderBottom: "1px solid rgba(200,169,110,0.3)",
            paddingBottom: "2px",
            transition: "color 0.2s, border-color 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#f0d090";
            e.currentTarget.style.borderColor = "rgba(240,208,144,0.6)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#c8a96e";
            e.currentTarget.style.borderColor = "rgba(200,169,110,0.3)";
          }}
        >
          픽해줌 · PickHeaZoom
        </a>
        <p style={{ fontSize: "0.68rem", color: "#3a3020", marginTop: "5px", letterSpacing: "0.05em" }}>
          네이버 블로그
        </p>
      </div>
    </div>
  );
}

function btn(bg, border) {
  return {
    background: bg, border: `1px solid ${border}`, color: border,
    padding: "8px 16px", borderRadius: "4px", cursor: "pointer",
    fontSize: "0.8rem", letterSpacing: "0.08em",
    fontFamily: "'Courier New', monospace", transition: "all 0.15s",
  };
}
