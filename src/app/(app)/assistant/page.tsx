import Chat from "@/components/Chat";
import { isAiConfigured } from "@/lib/config";

export const metadata = { title: "Ask AI" };

export default function Assistant() {
  return (
    <div className="mx-auto max-w-3xl">
      <Chat configured={isAiConfigured()} />
    </div>
  );
}
