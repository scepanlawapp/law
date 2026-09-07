import { Component } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";

interface Conversation {
  title: string;
  preview: string;
  time: string;
  icon: string;
  group: "Today" | "Yesterday" | "This week";
  active?: boolean;
}

interface AssistantMessage {
  author: "assistant" | "user";
  time: string;
  text?: string;
  title?: string;
  sections?: { heading: string; items: string[] }[];
}

@Component({
  selector: "app-assistant",
  standalone: true,
  imports: [MatIconModule],
  templateUrl: "./assistant.component.html",
  styleUrl: "./assistant.component.scss",
})
export class AssistantComponent {
  readonly conversations: Conversation[] = [
    {
      title: "Analysis of case P-123/2026",
      preview: "Here is a summary of the key points in this case...",
      time: "10:24",
      icon: "balance",
      group: "Today",
      active: true,
    },
    {
      title: "Contract analysis",
      preview: "The contract appears to be valid, but there are...",
      time: "09:17",
      icon: "balance",
      group: "Today",
    },
    {
      title: "Client overview - Marko Petrović",
      preview: "Marko Petrović has 4 active cases and 12 total...",
      time: "08:42",
      icon: "group",
      group: "Today",
    },
    {
      title: "Legal research - Commercial disputes",
      preview: "Here are the main legal grounds for a commercial...",
      time: "Yesterday",
      icon: "lightbulb",
      group: "Today",
    },
    {
      title: "Document analysis - Ugovor.pdf",
      preview: "I analyzed the document and extracted the following...",
      time: "16:32",
      icon: "description",
      group: "Yesterday",
    },
    {
      title: "Case strategy - P-124/2026",
      preview: "Based on the available information, I recommend...",
      time: "14:11",
      icon: "balance",
      group: "Yesterday",
    },
    {
      title: "Deadline check",
      preview: "You have 3 upcoming deadlines in the next 7 days...",
      time: "11:03",
      icon: "calendar_month",
      group: "Yesterday",
    },
    {
      title: "Court practice - Appeals",
      preview: "Here are some relevant court decisions for similar cases...",
      time: "Sep 5",
      icon: "balance",
      group: "This week",
    },
    {
      title: "Client communication",
      preview: "Drafted a response to the client regarding the case status...",
      time: "Sep 4",
      icon: "group",
      group: "This week",
    },
  ];

  readonly messages: AssistantMessage[] = [
    {
      author: "assistant",
      time: "10:24",
      title: "Good morning, Scepane. 👋",
      text: "How can I help you today?",
    },
    {
      author: "user",
      time: "10:26",
      text: "Can you analyze case P-123/2026 and give me a summary of the key points, risks and next steps?",
    },
    {
      author: "assistant",
      time: "10:28",
      title: "Case Analysis - P-123/2026",
      sections: [
        {
          heading: "Summary",
          items: [
            "This is a civil case filed by Marko Petrović against the opposing party regarding a contractual dispute related to non-payment.",
          ],
        },
        {
          heading: "Key Points",
          items: [
            "Case type: Civil dispute",
            "Court: Basic Court in Subotica",
            "Opposing party: Adriatic d.o.o.",
            "Last action: Submission of response (Aug 28, 2026)",
            "Next hearing: September 14, 2026",
          ],
        },
        {
          heading: "Potential Risks",
          items: [
            "Risk of unfavorable decision if key evidence is not presented",
            "Possible delay due to court backlog",
            "Opposing party may file a counterclaim",
          ],
        },
        {
          heading: "Next Steps",
          items: [
            "Prepare for the upcoming hearing (September 14, 2026)",
            "Review and organize all relevant documents",
            "Consider filing additional evidence before the hearing",
          ],
        },
      ],
    },
  ];

  readonly conversationGroups = ["Today", "Yesterday", "This week"] as const;
}
