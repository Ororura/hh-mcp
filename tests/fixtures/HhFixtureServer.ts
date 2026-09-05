import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export type FixtureSessionMode = "authenticated" | "auth-required";

export class HhFixtureServer {
  #server = createServer((request, response) => this.handle(request, response));
  #submitCount = 0;
  sessionMode: FixtureSessionMode = "authenticated";
  baseUrl = "";

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.#server.once("error", reject);
      this.#server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = this.#server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${address.port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.#server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  get host(): string {
    return new URL(this.baseUrl).host;
  }

  get submitCount(): number {
    return this.#submitCount;
  }

  resetSubmissions(): void {
    this.#submitCount = 0;
  }

  vacancyUrl(id: number): string {
    return `${this.baseUrl}/vacancy/${id}`;
  }

  private handle(request: IncomingMessage, response: ServerResponse): void {
    const url = new URL(request.url ?? "/", this.baseUrl || "http://127.0.0.1");
    if (url.pathname === "/test-submit" && request.method === "POST") {
      this.#submitCount += 1;
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"ok":true}');
      return;
    }

    if (url.pathname === "/applicant/resumes") {
      this.html(response, this.page("Session", "", this.sessionMode));
      return;
    }

    const match = /^\/vacancy\/(\d+)$/.exec(url.pathname);
    if (!match?.[1]) {
      response.writeHead(404).end();
      return;
    }
    this.html(response, this.vacancy(Number(match[1])));
  }

  private vacancy(id: number): string {
    switch (id) {
      case 101:
        return this.page("Closed", '<div data-qa="vacancy-closed">Вакансия закрыта</div>');
      case 102:
        return this.page(
          "Applied",
          '<div data-qa="vacancy-response-link-view-topic">Вы уже откликнулись</div>',
        );
      case 103:
        return this.page("Questionnaire", this.applyButton("showQuestionnaire()"), "authenticated", scripts);
      case 104:
        return this.page(
          "Captcha",
          '<div data-qa="captcha">Подтвердите, что вы не робот</div>',
          "authenticated",
        );
      case 105:
        return this.page(
          "External",
          '<a data-qa="vacancy-response-link-top" href="https://employer.example/apply">Откликнуться</a>',
        );
      case 107:
        return this.page("Unknown", this.applyButton("void 0"));
      case 108:
        return this.page("No letter", this.applyButton("showForm(false, false)"), "authenticated", scripts);
      case 109:
        return this.page("Required letter", this.applyButton("showForm(true, true)"), "authenticated", scripts);
      case 110:
        return this.page("Login", this.applyButton("showForm(true, false)"), "auth-required", scripts);
      case 112:
        return this.page("Unsupported", "<p>Unknown vacancy controls</p>");
      case 113:
        return this.page("Direct submit", this.applyButton("submitApplication()"), "authenticated", scripts);
      case 114:
        return this.page(
          "Unconfirmed submit",
          this.applyButton("showUnconfirmedForm()"),
          "authenticated",
          scripts,
        );
      default:
        return this.page("Backend Developer", this.applyButton("showForm(true, false)"), "authenticated", scripts);
    }
  }

  private applyButton(action: string): string {
    return `<button data-qa="vacancy-response-link-top" onclick="${action}">Откликнуться</button>`;
  }

  private page(
    title: string,
    content: string,
    session: FixtureSessionMode = "authenticated",
    script = "",
  ): string {
    const menu =
      session === "authenticated"
        ? '<div data-qa="mainmenu_profileAndResumes">Profile and resumes</div>'
        : '<a data-qa="mainmenu_login">Войти</a>';
    return `<!doctype html>
      <html lang="ru"><head><meta charset="utf-8"><title>${title}</title></head>
      <body>${menu}<h1 data-qa="vacancy-title">${title}</h1>
      <div data-qa="vacancy-company-name">Example</div>${content}<script>${script}</script></body></html>`;
  }

  private html(response: ServerResponse, body: string): void {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(body);
  }
}

const scripts = `
  function showQuestionnaire() {
    document.body.insertAdjacentHTML('beforeend', '<div data-qa="vacancy-response-popup-form-questionnaire">Вопросы работодателя</div>');
  }
  function showForm(withLetter, required) {
    const letter = withLetter
      ? '<textarea data-qa="vacancy-response-popup-form-letter-input" ' + (required ? 'required aria-required="true"' : '') + '></textarea>'
      : '';
    document.body.insertAdjacentHTML('beforeend',
      '<div role="dialog" data-qa="vacancy-response-popup">' + letter +
      '<button data-qa="vacancy-response-submit-popup" onclick="submitApplication()">Отправить</button></div>');
  }
  async function submitApplication() {
    const response = await fetch('/test-submit', { method: 'POST' });
    if (response.ok) {
      document.querySelector('[data-qa="vacancy-response-popup"]')?.remove();
      document.body.insertAdjacentHTML('beforeend', '<div data-qa="vacancy-response-success">Отклик отправлен</div>');
    }
  }
  function showUnconfirmedForm() {
    document.body.insertAdjacentHTML('beforeend',
      '<div role="dialog" data-qa="vacancy-response-popup">' +
      '<button data-qa="vacancy-response-submit-popup" onclick="submitWithoutConfirmation()">Отправить</button></div>');
  }
  async function submitWithoutConfirmation() {
    await fetch('/test-submit', { method: 'POST' });
  }
`;
