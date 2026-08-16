# DeepSeek Harness integration research

The current master uses npm bundle packages with `dsh.bundle.patch`, installed into profiles by `dsh plugin --profile NAME add PACKAGE`. The patch is a YAML layer containing Cordis plugin rows; rows reference the published package name. Plugins export `apply(ctx)` and register model tools through `ctx.tools.register(defineTool(...))` from `@deepseek-ai/dsh-tools`. Tool definitions use `name`, `description`, `parameters`, `output.schema`, and async `execute(args, exec)`. This package follows that mechanism and does not modify Harness source.
