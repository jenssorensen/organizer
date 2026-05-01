import type { NoteSectionSummary } from "./noteSections";
import type { NoteTreeNode } from "./types";

export function filterEmptyNoteSections(sections: NoteSectionSummary[]) {
  return sections.filter((section) => section.noteCount > 0);
}

export function filterEmptyFolderNodes(tree: NoteTreeNode[]): NoteTreeNode[] {
  return pruneEmptyFolderNodes(tree).nodes;
}

function pruneEmptyFolderNodes(tree: NoteTreeNode[]): { nodes: NoteTreeNode[]; noteCount: number } {
  const nodes: NoteTreeNode[] = [];
  let noteCount = 0;

  for (const node of tree) {
    if (node.type === "note") {
      nodes.push(node);
      noteCount += 1;
      continue;
    }

    const prunedChildren = pruneEmptyFolderNodes(node.children);
    if (prunedChildren.noteCount === 0) {
      continue;
    }

    nodes.push({
      ...node,
      children: prunedChildren.nodes,
    });
    noteCount += prunedChildren.noteCount;
  }

  return { nodes, noteCount };
}
