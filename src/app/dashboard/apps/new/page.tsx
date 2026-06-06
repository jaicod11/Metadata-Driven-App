import { Metadata } from "next";
import { NewAppForm } from "@/components/config/NewAppForm";

export const metadata: Metadata = { title: "New App" };

export default function NewAppPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create New App</h1>
        <p className="text-sm text-gray-500 mt-1">
          Paste your JSON configuration below. Your app will be live immediately.
        </p>
      </div>
      <NewAppForm />
    </div>
  );
}
