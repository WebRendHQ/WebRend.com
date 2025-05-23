import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    domains: [
      'avatars.githubusercontent.com',
      'github.com',
      'raw.githubusercontent.com',
      'user-images.githubusercontent.com',
      'placehold.co',
      'images.unsplash.com',
      'randomuser.me'
    ],
  },
};

export default nextConfig;
