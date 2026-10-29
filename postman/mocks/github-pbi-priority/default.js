// Contract: https://docs.github.com/en/graphql/reference/projects
// Synthetic fixtures only. Unknown operations return 501.
const http = require("node:http");
const seed = () =>
  [2, 1].map((number) => ({
    id: `item-${number}`,
    isArchived: false,
    priority: { number },
    content: {
      __typename: "Issue",
      number,
      state: "OPEN",
      repository: { nameWithOwner: "engineer-first/idea-boost" },
      issueType: { name: "PBI" },
      parent: null,
    },
  }));
http
  .createServer(async (req, res) => {
    const send = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (req.method === "POST" && req.url === "/reset") {
      await pm.state.set("github-priority.items", seed());
      return send(200, { reset: true });
    }
    // Synthetic GitHub App authentication for the dedicated cron Worker.
    if (
      req.method === "GET" &&
      req.url === "/repos/engineer-first/idea-boost/installation"
    )
      return send(200, { id: 123 });
    if (
      req.method === "POST" &&
      req.url === "/app/installations/123/access_tokens"
    ) {
      if (
        JSON.stringify(req.body) !==
        JSON.stringify({
          repositories: ["idea-boost"],
          permissions: { issues: "read", organization_projects: "write" },
        })
      )
        return send(422, { message: "Unexpected token scope" });
      return send(201, { token: "synthetic-installation-token" });
    }
    if (req.method === "DELETE" && req.url === "/installation/token") {
      res.writeHead(204);
      return res.end();
    }
    if (req.method !== "POST" || req.url !== "/graphql")
      return send(501, { error: "Unsupported endpoint" });
    const { query, variables } = req.body ?? {};
    const items = (await pm.state.get("github-priority.items")) || seed();
    if (query?.includes("query PbiPrioritySnapshot"))
      return send(200, {
        data: {
          organization: {
            projectV2: {
              id: "project",
              field: { id: "priority", name: "優先順位", dataType: "NUMBER" },
              view: {
                filter:
                  "repo:engineer-first/idea-boost is:issue type:PBI is:open",
                sortByFields: { totalCount: 0 },
                groupByFields: { totalCount: 0 },
              },
              items: {
                nodes: items,
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      });
    if (query?.includes("mutation UpdatePbiPriority")) {
      const item = items.find((item) => item.id === variables?.itemId);
      if (
        !item ||
        variables.projectId !== "project" ||
        variables.fieldId !== "priority" ||
        !Number.isInteger(variables.priority)
      )
        return send(200, { errors: [{ message: "Invalid update" }] });
      item.priority = { number: variables.priority };
      await pm.state.set("github-priority.items", items);
      return send(200, {
        data: {
          updateProjectV2ItemFieldValue: { projectV2Item: { id: item.id } },
        },
      });
    }
    return send(501, { error: "Unsupported GraphQL operation" });
  })
  .listen(process.env.PORT || 4917);
