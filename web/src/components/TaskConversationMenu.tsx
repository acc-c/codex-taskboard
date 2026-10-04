import { useState } from "react";
import type { TaskConversationItem } from "../taskConversations";
import { LinearIcon } from "./LinearIcon";

export interface TaskConversationMenuProps {
  conversations: TaskConversationItem[];
  onOpenConversation: (conversation: TaskConversationItem) => void;
}

function conversationLabel(conversation: TaskConversationItem): string {
  return conversation.kind === "local-ai" ? "内置 AI" : "Codex";
}

function conversationStatus(conversation: TaskConversationItem): string {
  return conversation.currentRun?.status === "running" ? "运行中" : conversationLabel(conversation);
}

/** Compact task-card control for one or more linked Codex conversations. */
export function TaskConversationMenu({
  conversations,
  onOpenConversation,
}: TaskConversationMenuProps) {
  const [open, setOpen] = useState(false);
  if (conversations.length === 0) return null;

  if (conversations.length === 1) {
    const conversation = conversations[0];
    return (
      <button
        className="task-conversation-trigger"
        type="button"
        aria-label={`打开对话 ${conversation.title}`}
        title={conversation.title}
        onClick={(event) => {
          event.stopPropagation();
          onOpenConversation(conversation);
        }}
      >
        <LinearIcon name="conversation" />
      </button>
    );
  }

  return (
    <details
      className="task-conversation-menu"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      onClick={(event) => event.stopPropagation()}
    >
      <summary
        className="task-conversation-trigger is-multiple"
        aria-label={`查看 ${conversations.length} 个对话`}
        title={`${conversations.length} 个关联对话`}
      >
        <LinearIcon name="conversation" />
        <span>{conversations.length}</span>
      </summary>
      <div role="menu" aria-label="关联对话">
        {conversations.map((conversation) => (
          <button
            key={conversation.key}
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onOpenConversation(conversation);
            }}
          >
            <span>{conversation.title}</span>
            <small>{conversationStatus(conversation)}</small>
          </button>
        ))}
      </div>
    </details>
  );
}
