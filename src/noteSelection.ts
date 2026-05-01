type NoteTreeNodeLike = NoteFolderNodeLike | NoteLeafNodeLike;

type NoteFolderNodeLike = {
  id: string;
  type: "folder";
  children: NoteTreeNodeLike[];
};

type NoteLeafNodeLike = {
  id: string;
  type: "note";
};

export function resolveSelectedNoteNodeId({
  currentSelectedNoteNodeId,
  rootNodeId,
  tree,
}: {
  currentSelectedNoteNodeId: string | null;
  rootNodeId: string;
  tree: NoteTreeNodeLike[];
}): string {
  if (!currentSelectedNoteNodeId || currentSelectedNoteNodeId === rootNodeId) {
    return rootNodeId;
  }

  return findNoteTreeNodeById(tree, currentSelectedNoteNodeId) ? currentSelectedNoteNodeId : rootNodeId;
}

function findNoteTreeNodeById(tree: NoteTreeNodeLike[], targetId: string): NoteTreeNodeLike | null {
  for (const node of tree) {
    if (node.id === targetId) {
      return node;
    }

    if (node.type === "folder") {
      const nestedNode = findNoteTreeNodeById(node.children, targetId);
      if (nestedNode) {
        return nestedNode;
      }
    }
  }

  return null;
}
