declare module 'pdf-parse/lib/pdf-parse.js' {
  const pdf: (buffer: Buffer, options?: { max?: number }) => Promise<{ text: string }>;
  export default pdf;
}
