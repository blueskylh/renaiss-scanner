import ConsecutiveScanner from "@/components/ConsecutiveScanner"

// Frontend API calls should use `src/lib/api.ts`, not absolute `/api/...` URLs.
export default function App() {
  return (
    <div className="min-h-screen bg-bg-chat">
      <div className="px-4 py-8 sm:px-6 lg:px-8">
        <ConsecutiveScanner />
      </div>
    </div>
  )
}
