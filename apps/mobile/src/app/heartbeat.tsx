import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useFamilyContext } from "@/context/FamilyContext";

export default function HeartbeatRoute() {
  const router = useRouter();
  const { sendHeartbeat } = useFamilyContext();

  useEffect(() => {
    sendHeartbeat();
    router.replace("/(tabs)");
  }, []);

  return null;
}
