import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { knowledgeEntriesByComponentQuery, referenceEntriesByComponentQuery } from "@/lib/queries";
import { KnowledgeCreateForm, KnowledgeList } from "./KnowledgeSection";
import { ReferenceCreateForm, ReferenceList } from "./ReferenceSection";
import { SectionCard, buttonClass } from "./ui";

export function ComponentTagsSection({ componentId }: { componentId: string }) {
  const knowledge = useQuery(knowledgeEntriesByComponentQuery(componentId));
  const references = useQuery(referenceEntriesByComponentQuery(componentId));
  const [addingKnowledge, setAddingKnowledge] = useState(false);
  const [addingReference, setAddingReference] = useState(false);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <SectionCard
        title="KNOWLEDGE"
        action={
          <button
            type="button"
            className={buttonClass}
            onClick={() => setAddingKnowledge((v) => !v)}
          >
            {addingKnowledge ? "CLOSE" : "+ ADD KNOWLEDGE"}
          </button>
        }
      >
        {addingKnowledge && (
          <KnowledgeCreateForm
            initialLinks={{ component_id: componentId }}
            onDone={() => setAddingKnowledge(false)}
          />
        )}
        <KnowledgeList
          entries={knowledge.data ?? []}
          emptyMessage="이 COMPONENT에 연결된 KNOWLEDGE 없음"
        />
      </SectionCard>
      <SectionCard
        title="REFERENCES"
        action={
          <button
            type="button"
            className={buttonClass}
            onClick={() => setAddingReference((v) => !v)}
          >
            {addingReference ? "CLOSE" : "+ ADD REFERENCE"}
          </button>
        }
      >
        {addingReference && (
          <ReferenceCreateForm
            initialLinks={{ component_id: componentId }}
            onDone={() => setAddingReference(false)}
          />
        )}
        <ReferenceList
          entries={references.data ?? []}
          emptyMessage="이 COMPONENT에 연결된 REFERENCE 없음"
        />
      </SectionCard>
    </div>
  );
}
