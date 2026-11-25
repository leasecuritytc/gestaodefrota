import { useEffect, useRef } from "react";

// Vídeo de fundo da entrada (login e telas de acesso): em loop infinito,
// sem som (navegadores só liberam autoplay mudo) e sem controles.
export default function VideoFundo() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    v.play().catch(() => undefined);
    // Garantia extra do loop: se algum navegador ignorar o atributo, reinicia ao terminar.
    const reiniciar = () => {
      v.currentTime = 0;
      v.play().catch(() => undefined);
    };
    v.addEventListener("ended", reiniciar);
    return () => v.removeEventListener("ended", reiniciar);
  }, []);

  return (
    <video
      ref={ref}
      className="auth-video"
      src="/entrada.mp4"
      poster="/entrada-poster.jpg"
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}
