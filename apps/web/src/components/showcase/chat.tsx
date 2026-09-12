import { useState } from 'react'
import {
  DownloadIcon,
  FileTextIcon,
  ImageIcon,
  LockIcon,
  ShieldCheckIcon,
  UserPlusIcon,
  XIcon,
} from 'lucide-react'
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from '@hack4justice/ui/components/attachment'
import { Avatar, AvatarFallback } from '@hack4justice/ui/components/avatar'
import { Badge } from '@hack4justice/ui/components/badge'
import {
  Bubble,
  BubbleContent,
  BubbleGroup,
  BubbleReactions,
} from '@hack4justice/ui/components/bubble'
import { Marker, MarkerContent, MarkerIcon } from '@hack4justice/ui/components/marker'
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
  MessageHeader,
} from '@hack4justice/ui/components/message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@hack4justice/ui/components/message-scroller'
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from '@hack4justice/ui/components/questionnaire'
import { Row, Section } from '#/components/showcase/primitives'

const BUBBLE_VARIANTS = [
  'default',
  'secondary',
  'muted',
  'tinted',
  'outline',
  'ghost',
  'destructive',
] as const

const TENANCY_LABELS: Record<string, string> = {
  private: 'Private rental',
  social: 'Social housing',
  lodger: 'Lodger / room in the landlord’s home',
}

function AssistantAvatar() {
  return (
    <MessageAvatar>
      <Avatar>
        <AvatarFallback>LA</AvatarFallback>
      </Avatar>
    </MessageAvatar>
  )
}

function ClientAvatar() {
  return (
    <MessageAvatar>
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>
    </MessageAvatar>
  )
}

function Conversation() {
  const [tenancy, setTenancy] = useState<string | null>(null)

  return (
    <MessageScrollerProvider autoScroll>
      <div className="h-96 overflow-hidden rounded-xl border bg-card text-card-foreground">
        <MessageScroller>
          <MessageScrollerViewport aria-label="Conversation with the legal-aid assistant">
            <MessageScrollerContent className="p-4">
              <MessageScrollerItem messageId="today">
                <Marker variant="separator">
                  <MarkerContent>Today</MarkerContent>
                </Marker>
              </MessageScrollerItem>

              <MessageScrollerItem messageId="m1">
                <Message align="start">
                  <AssistantAvatar />
                  <MessageContent>
                    <MessageHeader>Legal-aid assistant</MessageHeader>
                    <Bubble variant="muted">
                      <BubbleContent>
                        Hello Amina, I am the legal-aid assistant. I can explain your rights and
                        point you to free help. What is going on?
                      </BubbleContent>
                    </Bubble>
                    <MessageFooter>09:12</MessageFooter>
                  </MessageContent>
                </Message>
              </MessageScrollerItem>

              <MessageScrollerItem messageId="m2" scrollAnchor>
                <Message align="end">
                  <ClientAvatar />
                  <MessageContent>
                    <MessageHeader>You</MessageHeader>
                    <Bubble variant="default" align="end">
                      <BubbleContent>
                        My landlord put a letter under my door saying I have to leave in 7 days.
                        Can he do that?
                      </BubbleContent>
                    </Bubble>
                    <MessageFooter>09:13</MessageFooter>
                  </MessageContent>
                </Message>
              </MessageScrollerItem>

              <MessageScrollerItem messageId="m3">
                <Message align="start">
                  <AssistantAvatar />
                  <MessageContent>
                    <MessageHeader>Legal-aid assistant</MessageHeader>
                    <BubbleGroup>
                      <Bubble variant="muted">
                        <BubbleContent>
                          In most tenancies a landlord cannot make you leave with only 7 days of
                          notice, and never without a court order. The exact rules depend on the
                          kind of tenancy you have.
                        </BubbleContent>
                      </Bubble>
                      <Bubble variant="muted">
                        <BubbleContent>
                          Could you upload the letter? I will check the notice period it claims.
                        </BubbleContent>
                      </Bubble>
                    </BubbleGroup>
                    <MessageFooter>09:14</MessageFooter>
                  </MessageContent>
                </Message>
              </MessageScrollerItem>

              <MessageScrollerItem messageId="m4" scrollAnchor>
                <Message align="end">
                  <ClientAvatar />
                  <MessageContent>
                    <MessageHeader>You</MessageHeader>
                    <Bubble variant="default" align="end">
                      <BubbleContent>Here it is.</BubbleContent>
                    </Bubble>
                    <Attachment state="done" size="sm">
                      <AttachmentMedia variant="icon">
                        <FileTextIcon />
                      </AttachmentMedia>
                      <AttachmentContent>
                        <AttachmentTitle>notice-to-quit.pdf</AttachmentTitle>
                        <AttachmentDescription>PDF · 312 KB</AttachmentDescription>
                      </AttachmentContent>
                      <AttachmentActions>
                        <AttachmentAction aria-label="Download notice-to-quit.pdf">
                          <DownloadIcon />
                        </AttachmentAction>
                      </AttachmentActions>
                    </Attachment>
                    <MessageFooter>09:16</MessageFooter>
                  </MessageContent>
                </Message>
              </MessageScrollerItem>

              <MessageScrollerItem messageId="system-1">
                <Marker>
                  <MarkerIcon>
                    <ShieldCheckIcon />
                  </MarkerIcon>
                  <MarkerContent>
                    Document scanned. Personal details are redacted before review.
                  </MarkerContent>
                </Marker>
              </MessageScrollerItem>

              <MessageScrollerItem messageId="m5">
                <Message align="start">
                  <AssistantAvatar />
                  <MessageContent>
                    <MessageHeader>Legal-aid assistant</MessageHeader>
                    <Bubble variant="muted">
                      <BubbleContent>
                        Thanks. The letter gives 7 days, which is shorter than the legal minimum
                        for every ordinary tenancy. To match you with the right adviser, tell me
                        which describes your home.
                      </BubbleContent>
                    </Bubble>
                    {tenancy === null ? (
                      <Bubble variant="outline" className="w-full max-w-md">
                        <BubbleContent className="w-full">
                          <Questionnaire
                            onSubmit={(event) => {
                              event.preventDefault()
                              const value = new FormData(event.currentTarget).get('tenancy')
                              if (typeof value === 'string') setTenancy(value)
                            }}
                          >
                            <QuestionnaireItem name="tenancy" required>
                              <QuestionnaireTitle>What kind of tenancy do you have?</QuestionnaireTitle>
                              <QuestionnaireChoices>
                                <QuestionnaireChoice value="private">
                                  Private rental
                                  <QuestionnaireChoiceDescription>
                                    You rent from a private landlord or agency
                                  </QuestionnaireChoiceDescription>
                                </QuestionnaireChoice>
                                <QuestionnaireChoice value="social">
                                  Social housing
                                  <QuestionnaireChoiceDescription>
                                    Council or housing-association tenancy
                                  </QuestionnaireChoiceDescription>
                                </QuestionnaireChoice>
                                <QuestionnaireChoice value="lodger">
                                  Lodger
                                  <QuestionnaireChoiceDescription>
                                    You rent a room in the landlord’s own home
                                  </QuestionnaireChoiceDescription>
                                </QuestionnaireChoice>
                              </QuestionnaireChoices>
                              <QuestionnaireActions>
                                <QuestionnaireSubmit>Send answer</QuestionnaireSubmit>
                              </QuestionnaireActions>
                            </QuestionnaireItem>
                          </Questionnaire>
                        </BubbleContent>
                      </Bubble>
                    ) : null}
                    <MessageFooter>09:17</MessageFooter>
                  </MessageContent>
                </Message>
              </MessageScrollerItem>

              {tenancy !== null ? (
                <MessageScrollerItem messageId="m6" scrollAnchor>
                  <MessageGroup>
                    <Message align="end">
                      <ClientAvatar />
                      <MessageContent>
                        <Bubble variant="default" align="end">
                          <BubbleContent>{TENANCY_LABELS[tenancy] ?? tenancy}</BubbleContent>
                        </Bubble>
                      </MessageContent>
                    </Message>
                    <Message align="start">
                      <AssistantAvatar />
                      <MessageContent>
                        <Bubble variant="muted">
                          <BubbleContent>
                            Noted. I am preparing a summary of your rights and a list of free
                            housing advisers near you. You do not have to leave on the date in the
                            letter.
                          </BubbleContent>
                        </Bubble>
                        <MessageFooter>09:18</MessageFooter>
                      </MessageContent>
                    </Message>
                  </MessageGroup>
                </MessageScrollerItem>
              ) : null}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </div>
    </MessageScrollerProvider>
  )
}

function IntakeQuestionnaire() {
  const [submitted, setSubmitted] = useState<string | null>(null)

  return (
    <div className="flex w-full max-w-lg flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground">
      <Questionnaire
        shortcuts="letters"
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          const issues = data.getAll('issues').filter((v): v is string => typeof v === 'string')
          const deadline = data.get('deadline')
          setSubmitted(
            [
              `Urgency: ${String(data.get('urgency') ?? 'not answered')}`,
              `Issues: ${issues.length > 0 ? issues.join(', ') : 'none selected'}`,
              `Deadline: ${typeof deadline === 'string' && deadline !== '' ? deadline : 'none'}`,
            ].join(' · '),
          )
        }}
      >
        <QuestionnaireProgress />

        <QuestionnaireItem name="urgency" required>
          <QuestionnaireTitle>How urgent is your situation?</QuestionnaireTitle>
          <QuestionnaireDescription>
            This helps us route you to same-day help when it matters.
          </QuestionnaireDescription>
          <QuestionnaireChoices>
            <QuestionnaireChoice value="today">
              I need help today
              <QuestionnaireChoiceDescription>Court date, eviction or safety risk</QuestionnaireChoiceDescription>
            </QuestionnaireChoice>
            <QuestionnaireChoice value="week">Within the week</QuestionnaireChoice>
            <QuestionnaireChoice value="later">Just getting information</QuestionnaireChoice>
          </QuestionnaireChoices>
          <QuestionnaireActions>
            <QuestionnairePrevious />
            <QuestionnaireSkip />
            <QuestionnaireNext />
          </QuestionnaireActions>
        </QuestionnaireItem>

        <QuestionnaireItem name="issues" multiple>
          <QuestionnaireTitle>Which of these apply?</QuestionnaireTitle>
          <QuestionnaireDescription>Select all that apply.</QuestionnaireDescription>
          <QuestionnaireChoices>
            <QuestionnaireChoice value="housing">Housing or eviction</QuestionnaireChoice>
            <QuestionnaireChoice value="employment">Employment or unpaid wages</QuestionnaireChoice>
            <QuestionnaireChoice value="family">Family or domestic matters</QuestionnaireChoice>
            <QuestionnaireChoice value="immigration" disabled>
              Immigration
              <QuestionnaireChoiceDescription>Handled by a partner service</QuestionnaireChoiceDescription>
            </QuestionnaireChoice>
          </QuestionnaireChoices>
          <QuestionnaireActions>
            <QuestionnairePrevious />
            <QuestionnaireSkip />
            <QuestionnaireNext />
          </QuestionnaireActions>
        </QuestionnaireItem>

        <QuestionnaireItem name="deadline">
          <QuestionnaireTitle>Is there a date you must act by?</QuestionnaireTitle>
          <QuestionnaireDescription>
            For example a hearing date or the date on a notice. Leave blank if none.
          </QuestionnaireDescription>
          <QuestionnaireInput type="date" />
          <QuestionnaireActions>
            <QuestionnairePrevious />
            <QuestionnaireSkip />
            <QuestionnaireSubmit />
          </QuestionnaireActions>
        </QuestionnaireItem>
      </Questionnaire>

      {submitted !== null ? (
        <Marker variant="border">
          <MarkerIcon>
            <ShieldCheckIcon />
          </MarkerIcon>
          <MarkerContent>Submitted: {submitted}</MarkerContent>
        </Marker>
      ) : null}
    </div>
  )
}

export function ChatShowcase() {
  return (
    <>
      <Section
        title="Message & Bubble"
        description="Message lays out a row (avatar, header, content, footer) with start/end alignment. Bubble is the coloured surface inside it."
      >
        <Row label="Bubble variants">
          {BUBBLE_VARIANTS.map((variant) => (
            <Bubble key={variant} variant={variant}>
              <BubbleContent>{variant}</BubbleContent>
            </Bubble>
          ))}
        </Row>

        <Row label="Aligned rows">
          <div className="flex w-full max-w-xl flex-col gap-4">
            <Message align="start">
              <AssistantAvatar />
              <MessageContent>
                <MessageHeader>Legal-aid assistant</MessageHeader>
                <Bubble variant="muted">
                  <BubbleContent>You have the right to a written notice with the reasons.</BubbleContent>
                </Bubble>
                <MessageFooter>Just now</MessageFooter>
              </MessageContent>
            </Message>
            <Message align="end">
              <ClientAvatar />
              <MessageContent>
                <MessageHeader>You</MessageHeader>
                <Bubble variant="default" align="end">
                  <BubbleContent>He never gave me anything in writing.</BubbleContent>
                </Bubble>
                <MessageFooter>Just now · Read</MessageFooter>
              </MessageContent>
            </Message>
          </div>
        </Row>

        <Row label="Grouped bubbles">
          <Message align="start" className="max-w-xl">
            <AssistantAvatar />
            <MessageContent>
              <BubbleGroup>
                <Bubble variant="muted">
                  <BubbleContent>Keep every letter and text from your landlord.</BubbleContent>
                </Bubble>
                <Bubble variant="muted">
                  <BubbleContent>Photograph anything left under the door.</BubbleContent>
                </Bubble>
                <Bubble variant="muted">
                  <BubbleContent>Do not hand over the keys until you have advice.</BubbleContent>
                </Bubble>
              </BubbleGroup>
            </MessageContent>
          </Message>
        </Row>

        <Row label="Reactions">
          <div className="flex w-full max-w-xl flex-col gap-6 py-2">
            <Bubble variant="muted">
              <BubbleContent>Your hearing has been moved to Tuesday at 10:00.</BubbleContent>
              <BubbleReactions side="bottom" align="start">
                <Badge variant="secondary">👍 2</Badge>
              </BubbleReactions>
            </Bubble>
            <Bubble variant="default" align="end">
              <BubbleContent>Thank you, I will be there.</BubbleContent>
              <BubbleReactions side="top" align="end">
                <Badge variant="secondary">❤️ 1</Badge>
              </BubbleReactions>
            </Bubble>
          </div>
        </Row>

        <Row label="Interactive content">
          <Bubble variant="outline">
            <BubbleContent render={<button type="button" />}>
              Tap to open the tenancy rights guide
            </BubbleContent>
          </Bubble>
        </Row>
      </Section>

      <Section
        title="Message scroller"
        description="MessageScroller owns scrolling, anchoring and the jump-to-latest button. Scroll up in the thread to reveal the button; answer the inline question to append messages."
      >
        <Conversation />
      </Section>

      <Section
        title="Attachment"
        description="File and image attachments with upload state, size and orientation. Wire state to the real upload status."
      >
        <Row label="States">
          <Attachment state="idle">
            <AttachmentMedia variant="icon">
              <FileTextIcon />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>Drop a file</AttachmentTitle>
              <AttachmentDescription>PDF, PNG or JPG</AttachmentDescription>
            </AttachmentContent>
          </Attachment>
          <Attachment state="uploading">
            <AttachmentMedia variant="icon">
              <FileTextIcon />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>tenancy-agreement.pdf</AttachmentTitle>
              <AttachmentDescription>Uploading · 1.8 MB</AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
              <AttachmentAction aria-label="Cancel upload">
                <XIcon />
              </AttachmentAction>
            </AttachmentActions>
          </Attachment>
          <Attachment state="processing">
            <AttachmentMedia variant="icon">
              <FileTextIcon />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>bank-statement.pdf</AttachmentTitle>
              <AttachmentDescription>Redacting personal data</AttachmentDescription>
            </AttachmentContent>
          </Attachment>
          <Attachment state="error">
            <AttachmentMedia variant="icon">
              <FileTextIcon />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>payslip.heic</AttachmentTitle>
              <AttachmentDescription>Unsupported file type</AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
              <AttachmentAction aria-label="Remove">
                <XIcon />
              </AttachmentAction>
            </AttachmentActions>
          </Attachment>
          <Attachment state="done">
            <AttachmentMedia variant="icon">
              <FileTextIcon />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>notice-to-quit.pdf</AttachmentTitle>
              <AttachmentDescription>PDF · 312 KB</AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
              <AttachmentAction aria-label="Download">
                <DownloadIcon />
              </AttachmentAction>
            </AttachmentActions>
          </Attachment>
        </Row>

        <Row label="Sizes">
          {(['default', 'sm', 'xs'] as const).map((size) => (
            <Attachment key={size} size={size} state="done">
              <AttachmentMedia variant="icon">
                <FileTextIcon />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>court-letter.pdf</AttachmentTitle>
                <AttachmentDescription>size: {size}</AttachmentDescription>
              </AttachmentContent>
            </Attachment>
          ))}
        </Row>

        <Row label="Vertical and image">
          <Attachment orientation="vertical" state="done">
            <AttachmentMedia variant="icon">
              <FileTextIcon />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>lease.pdf</AttachmentTitle>
              <AttachmentDescription>2 pages</AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
              <AttachmentAction aria-label="Remove">
                <XIcon />
              </AttachmentAction>
            </AttachmentActions>
          </Attachment>
          <Attachment orientation="vertical" state="done">
            <AttachmentMedia variant="image">
              <ImageIcon />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>door-photo.jpg</AttachmentTitle>
              <AttachmentDescription>JPG · 1.1 MB</AttachmentDescription>
            </AttachmentContent>
          </Attachment>
        </Row>

        <Row label="Group (scrolls horizontally)">
          <AttachmentGroup className="w-full max-w-md">
            {['notice.pdf', 'lease.pdf', 'receipt-march.pdf', 'receipt-april.pdf', 'photo.jpg'].map(
              (name) => (
                <Attachment key={name} size="sm" state="done">
                  <AttachmentMedia variant="icon">
                    <FileTextIcon />
                  </AttachmentMedia>
                  <AttachmentContent>
                    <AttachmentTitle>{name}</AttachmentTitle>
                  </AttachmentContent>
                </Attachment>
              ),
            )}
          </AttachmentGroup>
        </Row>
      </Section>

      <Section
        title="Marker"
        description="System notes, date dividers and labelled separators. Never a Separator plus a centred span."
      >
        <div className="flex w-full max-w-xl flex-col gap-4">
          <Row label="Default (system note)">
            <div className="flex w-full flex-col gap-3">
              <Marker>
                <MarkerIcon>
                  <UserPlusIcon />
                </MarkerIcon>
                <MarkerContent>Sara (housing adviser) joined the conversation</MarkerContent>
              </Marker>
              <Marker>
                <MarkerIcon>
                  <LockIcon />
                </MarkerIcon>
                <MarkerContent>
                  Messages are end-to-end encrypted. <a href="#privacy">Learn more</a>
                </MarkerContent>
              </Marker>
            </div>
          </Row>
          <Row label="Separator (date divider)">
            <div className="flex w-full flex-col gap-3">
              <Marker variant="separator">
                <MarkerContent>Today</MarkerContent>
              </Marker>
              <Marker variant="separator">
                <MarkerContent>Yesterday</MarkerContent>
              </Marker>
            </div>
          </Row>
          <Row label="Border">
            <Marker variant="border">
              <MarkerIcon>
                <ShieldCheckIcon />
              </MarkerIcon>
              <MarkerContent>Case #4821 · Reviewed by a qualified adviser</MarkerContent>
            </Marker>
          </Row>
        </div>
      </Section>

      <Section
        title="Questionnaire"
        description="Inline structured questions: single choice, multiple choice and free input, with progress and keyboard shortcuts (press a letter to pick, Enter to continue)."
      >
        <IntakeQuestionnaire />
      </Section>
    </>
  )
}
