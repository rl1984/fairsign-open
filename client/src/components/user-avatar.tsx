import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { User } from "@shared/models/auth";

interface UserAvatarProps {
  user: User | null | undefined;
  className?: string;
  fallbackClassName?: string;
}

function getInitials(user: User | null | undefined): string {
  if (!user) return "U";
  const first = user.firstName?.[0] || "";
  const last = user.lastName?.[0] || "";
  return (first + last).toUpperCase() || user.email?.[0]?.toUpperCase() || "U";
}

async function fetchProfileImageUrl(): Promise<{ url: string }> {
  const res = await fetch("/api/auth/profile/image-url", {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error("Failed to fetch profile image URL");
  }
  return res.json();
}

export function UserAvatar({ user, className = "h-8 w-8", fallbackClassName }: UserAvatarProps) {
  const hasUploadedImage = !!user?.profileImageKey;
  
  const { data: imageUrlData } = useQuery<{ url: string }>({
    queryKey: ["/api/auth/profile/image-url", user?.profileImageKey],
    queryFn: fetchProfileImageUrl,
    enabled: hasUploadedImage && !user?.avatarUrl,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const imageUrl = user?.avatarUrl || imageUrlData?.url;

  return (
    <Avatar className={className}>
      {imageUrl && <AvatarImage src={imageUrl} alt="Profile" />}
      <AvatarFallback className={fallbackClassName}>
        {getInitials(user)}
      </AvatarFallback>
    </Avatar>
  );
}
