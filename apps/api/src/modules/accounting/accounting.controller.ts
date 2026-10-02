import { Body, Controller, Get, Post } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import { UserContext } from "../../common/auth/user-context";
import { AccountingService } from "./accounting.service";
import { CreateAccountDto } from "./dto/create-account.dto";
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

  @RequirePermissions("accounting.journals.create")
  @Post("journals/validate")
  validateJournal(@Body() dto: ValidateJournalDto) {
    return this.accounting.validateJournal(dto);
  }
}
