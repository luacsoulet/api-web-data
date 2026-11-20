"use client";

import dynamic from "next/dynamic";
import type { Props } from "../Maison3D";

const Maison3D = dynamic(() => import("../Maison3D"), { ssr: false }) as React.ComponentType<Props>;

export default function Bien3D(props: Props) {
  return <Maison3D {...props} />;
}
