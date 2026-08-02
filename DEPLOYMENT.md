# 🚀 길드리그 참석투표 디스코드 봇 구축 & 무료 24/7 배포 완벽 가이드

이 가이드는 **내 디스코드 서버에서 로컬 테스트**하는 방법부터, **Render.com + Supabase를 통해 24시간 100% 무료로 봇을 항시 가동**하고 **다른 서버 운영진에게 공유**하는 전체 절차를 안내합니다.

---

## 1단계: 디스코드 봇 생성 및 토큰/ID 발급

1. [Discord Developer Portal](https://discord.com/developers/applications)에 접속 및 로그인합니다.
2. 우측 상단의 **`New Application`** 버튼을 클릭하고 봇 이름(예: `길드리그 투표봇`)을 입력 후 생성합니다.
3. **Bot** 탭으로 이동합니다.
   - **`Reset Token`**을 눌러 봇 토큰(Token)을 복사해 둡니다. (⚠️ 토큰은 절대 외부에 유출되지 않게 주의하세요)
   - 아래의 **`PUBLIC BOT`** 옵션이 **ON(켜짐)** 상태인지 확인합니다. (다른 서버 운영진이 초대를 받아서 쓸 수 있게 해줍니다)
   - **`MESSAGE CONTENT INTENT`**, **`SERVER MEMBERS INTENT`** 항목을 켜줍니다(ON).
4. **OAuth2 -> General** 탭으로 이동합니다.
   - **CLIENT ID** (Application ID)를 복사해 둡니다.

---

## 2단계: 봇 초대 링크(OAuth2 URL) 만들기

다른 사람이나 본인 디스코드 서버에 봇을 설치할 초대 링크를 만드는 과정입니다.

1. **OAuth2 -> URL Generator** 탭으로 이동합니다.
2. **SCOPES** 섹션에서 다음 항목을 체크합니다:
   - `bot`
   - `applications.commands` (슬래시 커맨드 필수 권한)
3. **BOT PERMISSIONS** 섹션에서 아래 권한들을 체크합니다:
   - `Send Messages` (메시지 보내기)
   - `Embed Links` (임베드 링크)
   - `Use External Emojis` (외부 이모지 사용)
   - `Read Message History` (메시지 기록 보기)
   - (편의상 `Administrator` 권한을 주셔도 됩니다)
4. 하단에 생성된 **Generated URL**을 복사하여 웹 브라우저 주소창에 넣으면 **내 디스코드 서버에 봇을 초대**할 수 있습니다!

---

## 3단계: 로컬(내 컴퓨터)에서 테스트하기

1. 프로젝트 폴더 내 `.env.example` 파일을 복사하여 `.env` 파일로 만듭니다.
   ```bash
   cp .env.example .env
   ```
2. `.env` 파일 내용을 채워 넣습니다:
   ```env
   DISCORD_TOKEN=1단계에서_복사한_봇_토큰
   CLIENT_ID=1단계에서_복사한_클라이언트_ID
   DATABASE_URL="postgresql://user:password@localhost:5432/guildbot?schema=public"
   PORT=3000
   ```
   > 💡 **Tip (무료 DB)**: 로컬 PostgreSQL이 없는 경우, 4단계의 **Supabase** 또는 **Neon**에서 생성한 접속 주소를 `DATABASE_URL`에 바로 넣으시면 로컬에서도 클라우드 DB로 동일하게 테스트 가능합니다.

3. DB 테이블 생성 및 봇 실행:
   ```bash
   # DB 스키마 반영
   npm run prisma:push

   # 개발용 봇 실행 (코드 변경 시 자동 재시작)
   npm run dev
   ```

4. 내 디스코드 서버에서 다음 명령어들을 테스트해 보세요:
   - `/투표생성` (제목: `8/4 길드리그 참석투표`, 시간선택지: `8/4 19:00, 8/4 20:00, 8/4 21:00`)
   - 버튼 클릭 (참석/불참/미정) 테스트
   - `/투표현황`
   - `/투표종료`

---

## 4단계: 24시간 항시 가동 무료 클라우드 배포 (Render + Supabase)

컴퓨터를 꺼두어도 봇이 24시간 항시 켜져 있도록 설정하는 100% 무료 클라우드 배포법입니다.

### A. 무료 PostgreSQL DB 만들기 (Supabase)
1. [Supabase](https://supabase.com) 가입 후 **`New Project`**를 생성합니다. (비밀번호 설정)
2. Project Settings -> **Database** 탭으로 이동합니다.
3. Connection string (URI) 중 `Transaction Pooler` 또는 `Direct connection` URI(예: `postgresql://postgres.xxx:비밀번호@...:5432/postgres`)를 복사합니다.

### B. Render.com 무료 봇 호스팅
1. 이 프로젝트 코드를 본인의 **GitHub 저장소(Repository)**에 업로드(push)합니다.
2. [Render.com](https://render.com) 가입 후 로그인합니다.
3. **New +** -> **Web Service**를 선택하고, GitHub 저장소를 연결합니다.
4. 배포 정보 입력:
   - **Name**: `my-discord-vote-bot`
   - **Runtime**: `Node`
   - **Build Command**: `npm ci && npx prisma generate && npm run build`
   - **Start Command**: `npx prisma db push && npm start`
5. **Environment Variables** (환경 변수) 추가:
   - `DISCORD_TOKEN`: (1단계에서 받은 토큰)
   - `CLIENT_ID`: (1단계에서 받은 클라이언트 ID)
   - `DATABASE_URL`: (Supabase에서 복사한 PostgreSQL 주소)
   - `PORT`: `3000`
6. **Create Web Service** 클릭! 몇 분 후 봇이 배포되고 24시간 가동이 시작됩니다.

### C. 24시간 수면 방지 (UptimeRobot - 필수)
Render 무료 플랜은 15분간 요청이 없으면 봇이 잠에 듭니다. Express 웹 서버가 탑재되어 있으므로 아래 설정으로 24시간 계속 깨어있게 만들 수 있습니다.

1. Render 대시보드 상단에서 내 서비스의 **Web URL** (예: `https://my-discord-vote-bot.onrender.com`)을 복사합니다.
2. [UptimeRobot](https://uptimerobot.com) (무료 서비스) 가입 후 로그인합니다.
3. **Add New Monitor** 클릭:
   - **Monitor Type**: `HTTP(s)`
   - **Friendly Name**: `Discord Bot Keep-Alive`
   - **URL (or IP)**: Render에서 복사한 Web URL (`https://...onrender.com`)
   - **Monitoring Interval**: `5 minutes`
4. 저장하면 5분마다 UptimeRobot이 봇 서버에 핑을 날려 봇이 절대로 잠들지 않고 365일 24시간 켜져 있게 됩니다!

---

## 5단계: 다른 디스코드 운영진에게 공유하기

사용자가 봇을 만들고 다른 서버 운영진에게 공유할 수 있는 아키텍처로 구현되어 있습니다.

1. 2단계에서 만든 **봇 초대 링크(OAuth2 URL)**를 다른 디스코드 서버 운영진(길드장/관리자)에게 전달합니다.
2. 상대방 운영진이 초대 링크를 눌러 자신의 디스코드 서버에 봇을 설치합니다.
3. 해당 서버에서도 즉시 `/투표생성` 명령어를 사용할 수 있으며, 모든 투표 결과와 유저 데이터는 각각의 서버별로 완벽하게 독립 저장 및 관리됩니다.
