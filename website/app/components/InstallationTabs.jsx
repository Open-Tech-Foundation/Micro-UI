import { CodeBlock, Tabs } from "@opentf/web-docs";

export default function InstallationTabs() {
  return (
    <Tabs
      tabs={[
        { label: "pnpm", content: <CodeBlock lang="bash" code="pnpm add @opentf/micro-ui" /> },
        { label: "npm", content: <CodeBlock lang="bash" code="npm i @opentf/micro-ui" /> },
        { label: "yarn", content: <CodeBlock lang="bash" code="yarn add @opentf/micro-ui" /> },
        { label: "bun", content: <CodeBlock lang="bash" code="bun add @opentf/micro-ui" /> },
      ]}
    />
  );
}
