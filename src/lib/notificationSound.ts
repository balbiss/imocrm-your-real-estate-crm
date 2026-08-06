// "Ding" de duas notas sintetizado via Web Audio (sem depender de arquivo de
// audio). Funciona com a aba aberta em segundo plano/sem foco, mesmo em
// outra aba do navegador — só não toca com o navegador totalmente fechado
// (nesse caso quem cobre é o Service Worker via push, ver usePushNotifications).
export function playNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    [880, 1108.73].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.1;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });

    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch (e) {
    console.error("Erro ao tocar som de notificação:", e);
  }
}
