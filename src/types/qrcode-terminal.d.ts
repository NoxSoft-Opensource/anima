declare module "qrcode-terminal" {
  function generate(text: string, opts?: { small?: boolean }, cb?: (output: string) => void): void;
  export default { generate };
}

declare module "qrcode-terminal/vendor/QRCode/index.js" {
  const QRCode: unknown;
  export default QRCode;
}

declare module "qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel.js" {
  const QRErrorCorrectLevel: Record<string, unknown>;
  export default QRErrorCorrectLevel;
}
