import { Composition, Folder } from "remotion";
import {
  IdeaFlowOperationDemo,
  type IdeaFlowOperationDemoProps,
} from "./idea-flow-operation-demo";
import { IdeaBoostLaunch } from "./launch/idea-boost-launch";
import { OPERATION_DEMO_DURATION_FRAMES, OPERATION_DEMO_FPS } from "./timeline";

export function RemotionRoot() {
  return (
    <Folder name="IdeaFlow">
      <Composition
        id="IdeaBoostLaunch"
        component={IdeaBoostLaunch}
        durationInFrames={2520}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="IdeaFlowOperationDemo"
        component={IdeaFlowOperationDemo}
        durationInFrames={OPERATION_DEMO_DURATION_FRAMES}
        fps={OPERATION_DEMO_FPS}
        width={1920}
        height={1080}
        defaultProps={{} satisfies IdeaFlowOperationDemoProps}
      />
    </Folder>
  );
}
