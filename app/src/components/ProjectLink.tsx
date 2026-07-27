import { Button } from "./ui/button.tsx";
import { useConversationActions, useMessages } from "@/store/chat.ts";
import { MessageSquarePlus } from "lucide-react";
import CustomerServiceLink from "@/components/CustomerServiceLink.tsx";

function ProjectLink() {
  const messages = useMessages();
  const { toggle } = useConversationActions();

  return messages.length > 0 ? (
    <Button
      variant="outline"
      size="icon-md"
      className="rounded-full overflow-hidden"
      onClick={async () => await toggle(-1)}
    >
      <MessageSquarePlus className={`h-4 w-4`} />
    </Button>
  ) : (
    <CustomerServiceLink />
  );
}

export default ProjectLink;
