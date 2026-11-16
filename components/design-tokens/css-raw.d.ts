// Storybook（Vite）で CSS を文字列として読むための `?raw` import の型。
declare module "*.css?raw" {
  const content: string;
  export default content;
}
