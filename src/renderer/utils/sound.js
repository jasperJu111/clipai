// Web Audio API synthesized chime sound (zero external assets, crisp & pleasing)

let audioCtx = null

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (AudioContextClass) {
      audioCtx = new AudioContextClass()
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

/**
 * 播放清脆悦耳的健康/定时提醒和弦音
 */
export function playChimeSound() {
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime
    // Marimba/bell-like 3-note harmonic arpeggio (C5 -> E5 -> G5 -> C6)
    const notes = [
      { freq: 523.25, time: 0.0, dur: 0.4 },
      { freq: 659.25, time: 0.12, dur: 0.4 },
      { freq: 783.99, time: 0.24, dur: 0.5 },
      { freq: 1046.50, time: 0.36, dur: 0.9 }
    ]

    notes.forEach(({ freq, time, dur }) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + time)

      // Natural acoustic bell decay curve
      gain.gain.setValueAtTime(0.001, now + time)
      gain.gain.exponentialRampToValueAtTime(0.25, now + time + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + time + dur)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now + time)
      osc.stop(now + time + dur)
    })
  } catch (err) {
    console.error('Failed to play chime sound:', err)
  }
}
