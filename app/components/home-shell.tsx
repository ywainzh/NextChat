"use client";

import type { ReactNode } from "react";
import clsx from "clsx";

import styles from "./home.module.scss";
import BotIcon from "../icons/bot.svg";
import LoadingIcon from "../icons/three-dots.svg";
import { SlotID } from "../constant";

export function Loading(props: { noLogo?: boolean }) {
  return (
    <div className={clsx("no-dark", styles["loading-content"])}>
      {!props.noLogo && <BotIcon />}
      <LoadingIcon />
    </div>
  );
}

export function WindowContent(props: { children: ReactNode }) {
  return (
    <div className={styles["window-content"]} id={SlotID.AppBody}>
      {props?.children}
    </div>
  );
}
