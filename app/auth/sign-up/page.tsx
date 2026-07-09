import { SignUpForm } from "@/components/auth/SignUpForm";

export default function Page() {
  return (
    <div className="flex min-h-[80vh] w-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <SignUpForm />
      </div>
    </div>
  );
}
