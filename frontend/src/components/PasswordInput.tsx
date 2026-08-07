import { Eye, EyeOff } from "lucide-react";
import { useState, type InputHTMLAttributes } from "react";

// A plain password input plus a show/hide toggle — shared by LoginView and
// ManageUsersView's create-account form so both get the same eye icon
// rather than each hand-rolling it slightly differently.
export function PasswordInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={`${className ?? ""} pr-9`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        title={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted transition-colors hover:text-text"
      >
        {visible ? <EyeOff size={15} strokeWidth={2.25} /> : <Eye size={15} strokeWidth={2.25} />}
      </button>
    </div>
  );
}
