/** Text files imported whole, as Vite's `?raw` suffix provides. */
declare module '*.txt?raw' {
  const text: string;
  export default text;
}
