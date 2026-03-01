import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/api/auth.api'
import { toast } from 'sonner'

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { display_name?: string; email?: string }) =>
      authApi.updateProfile(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
      toast.success(result.message)
      if (result.email_verification_sent) {
        toast.info('Verification email sent to your new address')
      }
    },
    onError: () => toast.error('Failed to update profile'),
  })
}
