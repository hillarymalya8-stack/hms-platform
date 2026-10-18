import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import { UserContext } from "../../common/auth/user-context";
import { AccountingService } from "./accounting.service";
import { CloseBusinessDateDto } from "./dto/close-business-date.dto";
import { CreateAccountDto } from "./dto/create-account.dto";
import { CreateJournalDto } from "./dto/create-journal.dto";
import { ValidateJournalDto } from "./dto/validate-journal.dto";

@Controller("accounting")
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  @RequirePermissions("accounting.view")
  @Get("accounts")
  listAccounts(@CurrentUser() user: UserContext) {
    return this.accounting.listAccounts(user);
  }

  @RequirePermissions("accounting.accounts.manage")
  @Post("accounts")
  createAccount(@CurrentUser() user: UserContext, @Body() dto: CreateAccountDto) {
    return this.accounting.createAccount(user, dto);
  }

  @RequirePermissions("accounting.view")
  @Get("trial-balance")
  trialBalance(@CurrentUser() user: UserContext, @Query("from") from?: string, @Query("to") to?: string) {
    return this.accounting.trialBalance(user, from, to);
  }

  @RequirePermissions("accounting.view")
  @Get("journals")
  listJournals(@CurrentUser() user: UserContext, @Query("status") status?: string, @Query("limit") limit?: string) {
    return this.accounting.listJournals(user, status, limit);
  }

  @RequirePermissions("accounting.journals.create")
  @Post("journals/validate")
  validateJournal(@Body() dto: ValidateJournalDto) {
    return this.accounting.validateJournal(dto);
  }

  @RequirePermissions("accounting.journals.create")
  @Post("journals")
  createJournal(@CurrentUser() user: UserContext, @Body() dto: CreateJournalDto) {
    return this.accounting.createJournal(user, dto);
  }

  @RequirePermissions("accounting.journals.post")
  @Post("journals/:id/post")
  postJournal(@CurrentUser() user: UserContext, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.accounting.postJournal(user, id);
  }

  @RequirePermissions("accounting.view")
  @Get("business-date")
  businessDate(@CurrentUser() user: UserContext) {
    return this.accounting.getBusinessDate(user);
  }

  // Closing the day locks the ledger for that date, so it requires journal posting authority.
  @RequirePermissions("accounting.journals.post")
  @Post("business-date/close")
  closeBusinessDate(@CurrentUser() user: UserContext, @Body() dto: CloseBusinessDateDto) {
    return this.accounting.closeBusinessDate(user, dto ?? {});
  }
}
