// Reduz a foto escolhida no aparelho (lado maior 1280 px, JPEG) para caber no envio.
const MAX_BYTES = 700 * 1024;
export async function comprimirImagem(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const esc = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas");
  cv.width = Math.round(bmp.width * esc);
  cv.height = Math.round(bmp.height * esc);
  cv.getContext("2d")!.drawImage(bmp, 0, 0, cv.width, cv.height);
  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    const b: Blob | null = await new Promise((ok) => cv.toBlob(ok, "image/jpeg", q));
    if (b && b.size <= MAX_BYTES) return b;
  }
  throw new Error("Foto muito pesada mesmo após reduzir. Escolha outra.");
}
