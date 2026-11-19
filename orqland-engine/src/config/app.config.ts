// [HOST SHIM] Exists in the main codebase — do not copy.
export default () => ({
  port: parseInt(process.env.PORT ?? '4000', 10),
});
