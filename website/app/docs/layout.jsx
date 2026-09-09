import { DocsLayout } from "@opentf/web-docs";
import config from "../../otfw.config.js";

export default function DocsSectionLayout({ children }) {
  return (
    <DocsLayout config={config.docs} frame={false}>
      {children}
    </DocsLayout>
  );
}
