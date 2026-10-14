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
