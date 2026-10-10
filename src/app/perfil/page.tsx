import { ProfileForm } from "@/components/profile-form";
import { AccountActions } from "@/components/account-actions";
import { InstallApp } from "@/components/install-app";
export default function Page() {
  return (
    <>
      <ProfileForm />
      <InstallApp />
      <AccountActions />
    </>
  );
}
