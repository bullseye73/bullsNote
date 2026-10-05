// 일부 패키지의 dist .d.ts 누락(부분 설치) 대응용 심 선언. 런타임 JS는 정상.
declare module '@vitejs/plugin-react' {
  const plugin: any;
  export default plugin;
}
