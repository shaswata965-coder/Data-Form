import FormApp from "@/components/form/FormApp";

// The public form. It is fully static, so it is served from the CDN and
// cached by the service worker for offline use. No login required.
export default function Page() {
  return <FormApp />;
}
