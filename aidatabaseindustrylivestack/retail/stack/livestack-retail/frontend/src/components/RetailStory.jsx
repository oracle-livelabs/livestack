import storyData from './retailStoryData.json';

const STORIES = new Map(storyData.map((story) => [story.scene, story]));

export const RETAIL_STORY_SPINE = Object.freeze({
  retailer: 'Seer Sporting Goods',
  heroProduct: 'AllTerrain Hiking Boots',
  trigger: 'Creator-led demand is rising while inventory, fulfillment, and service pressure begin to surface.',
  objective: 'Decide how the retailer should respond without separating the customer story from operational evidence.',
});

export function getRetailStory(scene) {
  return STORIES.get(scene) || null;
}

export function RetailStoryRail() {
  return (
    <div className="welcome-story-rail" aria-label="AllTerrain Hiking Boots journey across ten scenes">
      <div className="welcome-story-rail__intro">
        <span className="welcome-story-rail__kicker">Nine use cases, one AllTerrain story</span>
        <p>
          The ten-scene journey starts with Data Foundation, then follows nine business use cases as Seer Sporting
          Goods detects a creator-led demand surge, explains customer intent, traces influence, tests fulfillment,
          verifies orders, governs returns, predicts the next pressure, asks the remaining business questions, and coordinates a governed agent response.
        </p>
        <p>
          Every scene answers one question and hands evidence to the next, using the same governed Oracle AI Database
          26ai foundation throughout the investigation.
        </p>
      </div>
      <ol className="welcome-story-rail__steps">
        {storyData.map((story) => (
          <li key={story.scene} className="welcome-story-step">
            <span className="welcome-story-step__stage">{story.stage}</span>
            <span className="welcome-story-step__use-cases">{story.current}</span>
            <span className="welcome-story-step__summary">{story.decision}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function RetailSceneStory({ scene }) {
  const story = getRetailStory(scene);
  if (!story) return null;

  return (
    <section
      className="retail-scene-story glass-card overflow-hidden"
      data-story-scene={story.scene}
      data-story-stage={story.stage}
      aria-label={`Scene ${story.stage} of 10: ${story.current}`}
    >
      <div className="retail-scene-story__spine" data-story-spine>
        <span className="retail-scene-story__case-label">The connected retail case</span>
        <span>
          <strong>{RETAIL_STORY_SPINE.heroProduct}</strong> · {RETAIL_STORY_SPINE.trigger}
        </span>
      </div>

      <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.85fr)]">
        <div className="space-y-3">
          <p className="section-kicker">
            Scene {story.stage} of 10 · {story.phase}
          </p>
          <h3 className="text-xl font-semibold">{story.title}</h3>

          <div className="retail-scene-story__question" data-story-question>
            <span>Question this scene answers</span>
            <p>{story.question}</p>
          </div>

          <p className="text-sm leading-6 text-[var(--color-text-dim)]" data-story-what>
            <strong className="text-[var(--color-text)]">What is happening:</strong>{' '}
            {story.what}
          </p>
          <p className="text-sm leading-6 text-[var(--color-text-dim)]" data-story-why>
            <strong className="text-[var(--color-text)]">Why it matters:</strong>{' '}
            {story.why}
          </p>
          <p className="text-sm leading-6 text-[var(--color-text-dim)]" data-story-capability>
            <strong className="text-[var(--color-text)]">Oracle capability:</strong>{' '}
            {story.capability}
          </p>

          <div className="retail-scene-story__decision" data-story-decision>
            <span>Decision unlocked</span>
            <p>{story.decision}</p>
          </div>

          <div
            className="grid gap-2 text-xs sm:grid-cols-3"
            data-story-progression
            aria-label={`Journey progression from ${story.previous} through ${story.current} to ${story.next}`}
          >
            <div className="retail-scene-story__step">
              <span>Previous</span>
              <p>{story.previous}</p>
            </div>
            <div className="retail-scene-story__step retail-scene-story__step--current">
              <span>Current</span>
              <p>{story.current}</p>
            </div>
            <div className="retail-scene-story__step">
              <span>Next</span>
              <p>{story.next}</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <p className="retail-scene-story__beats-label">Evidence path</p>
          <ol className="space-y-2" aria-label={`${story.current} journey beats`}>
            {story.beats.map((beat, index) => (
              <li key={beat} className="retail-scene-story__beat">
                <span>{index + 1}</span>
                <p>{beat}</p>
              </li>
            ))}
          </ol>
          <div className="retail-scene-story__handoff" data-story-handoff>
            <span>Evidence handed forward</span>
            <p>{story.handoff}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
