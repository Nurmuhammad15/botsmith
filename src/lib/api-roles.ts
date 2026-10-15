import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { check, db } from "@/lib/api-core";

export type UserRole = "buyer" | "seller" | "admin";

/** Ids of the super admins (the only admins who can change roles). */
export function useSuperAdminIds(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "super-admins"],
    enabled,
    queryFn: async () => (check(await db().rpc("admin_super_admins")) as string[]) ?? [],
  });
}

export function useAdminSetUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; role: UserRole }) => {
      check(await db().rpc("admin_set_user_role", { p_user: input.userId, p_role: input.role }));
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin"] }),
  });
}

export type EditableUserProfile = {
  fullName: string;
  phone: string;
  username: string;
  headline: string;
  location: string;
  experienceYears: number | null;
  website: string;
  bio: string;
};

export function useAdminUpdateUserProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; profile: EditableUserProfile }) => {
      const { profile } = input;
      check(
        await db().rpc("admin_update_user_profile", {
          p_user: input.userId,
          p_full_name: profile.fullName,
          p_phone: profile.phone,
          p_username: profile.username,
          p_headline: profile.headline,
          p_location: profile.location,
          p_experience_years: profile.experienceYears,
          p_website: profile.website,
          p_bio: profile.bio,
        }),
      );
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}
