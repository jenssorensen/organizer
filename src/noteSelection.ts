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
  fallbackSelectedNoteNodeId,
  rootNodeId,
  tree,
}: {
  currentSelectedNoteNodeId: string | null;
  fallbackSelectedNoteNodeId?: string | null;
  rootNodeId: string;
  tree: NoteTreeNodeLike[];
}): string {
  if (!currentSelectedNoteNodeId || currentSelectedNoteNodeId === rootNodeId) {
    return rootNodeId;
  }

  if (findNoteTreeNodeById(tree, currentSelectedNoteNodeId)) {
    return currentSelectedNoteNodeId;
  }

  if (
    fallbackSelectedNoteNodeId &&
    fallbackSelectedNoteNodeId !== rootNodeId &&
    findNoteTreeNodeById(tree, fallbackSelectedNoteNodeId)
  ) {
    return fallbackSelectedNoteNodeId;
  }

  return rootNodeId;
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
