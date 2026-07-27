import "@/assets/pages/chat.less";
import ChatWrapper from "@/components/home/ChatWrapper.tsx";
import SideBar from "@/components/home/SideBar.tsx";
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { setMenu } from "@/store/menu.ts";

function Home() {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(setMenu(false));
  }, [dispatch]);

  return (
    <div className={`home-page flex flex-row flex-1`}>
      <SideBar />
      <ChatWrapper />
    </div>
  );
}

export default Home;
