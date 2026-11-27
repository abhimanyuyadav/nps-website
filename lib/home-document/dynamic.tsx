import { lazy, Suspense, type ComponentType } from "react";

export default function dynamic<Props extends object>(
  load: () => Promise<ComponentType<Props>>,
  options: { loading: ComponentType },
) {
  const Panel = lazy(async () => ({ default: await load() }));
  const Loading = options.loading;
  return function LoadPanel(props: Props) {
    return (
      <Suspense fallback={<Loading />}>
        <Panel {...props} />
      </Suspense>
    );
  };
}
