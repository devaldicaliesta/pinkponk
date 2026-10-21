import darkUrl from "./wordmark-dark.svg";
import lightUrl from "./wordmark-light.svg";

export const Logo = ({ height = 72 }: { height?: number }) => (
  <div class="logo" style={{ height: `${height}px` }}>
    <img class="logo__dark" src={darkUrl} alt="PinkPonk" height={height} />
    <img class="logo__light" src={lightUrl} alt="PinkPonk" height={height} />
  </div>
);
