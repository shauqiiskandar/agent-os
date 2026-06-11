export const pingTool = {
  name: "ping",
  description:
    "Sanity check that the command_center MCP server is alive. Returns version and a list of currently registered tool names.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
};

export async function handlePing(_args) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            status: "ok",
            server: "command_center",
            version: "0.1.0",
            message: "command_center MCP server is online",
          },
          null,
          2
        ),
      },
    ],
  };
}
