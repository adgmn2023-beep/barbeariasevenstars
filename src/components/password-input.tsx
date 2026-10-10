"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
export function PasswordInput({
  name = "password",
  label = "Senha",
  autoComplete = "current-password",
  minLength = 8,
}: {
  name?: string;
  label?: string;
  autoComplete?: string;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label>
      {label}
      <span className="password-field">
        <input
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={128}
          required
        />
        <button
          type="button"
          className="quiet"
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
      </span>
    </label>
  );
}
